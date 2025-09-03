import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    Context,
} from 'aws-lambda';
import { modifyTextFile } from './fileOperations';
import { performGitWorkflow } from './gitOperations';
import { validateLambdaEvent, checkRateLimit } from './validation';
import {
    log,
    sendMetrics,
    PerformanceTimer,
    healthCheck,
    getGitConfigFromSecrets,
} from './compatibility';
import { LambdaEvent, EventBridgeEvent } from './types';

/**
 * Main Lambda handler function with enhanced security and monitoring
 * Supports both API Gateway and EventBridge events
 * @param event - API Gateway or EventBridge event
 * @param context - Lambda context
 * @returns Promise<APIGatewayProxyResult | void>
 */
export const handler = async (
    event: APIGatewayProxyEvent | EventBridgeEvent,
    context: Context
): Promise<APIGatewayProxyResult | void> => {
    const timer = new PerformanceTimer();
    const requestId = context.awsRequestId;
    let metrics = {
        executionDuration: 0,
        fileModificationSuccess: false,
        gitOperationSuccess: false,
        secretsRetrievalSuccess: false,
        totalErrors: 0,
        retryCount: 0,
    };

    try {
        log({
            level: 'INFO',
            message: 'Lambda function started',
            context: {
                eventType: 'body' in event ? 'API Gateway' : 'EventBridge',
                requestId,
            },
            requestId,
        });

        timer.checkpoint('start');

        // Determine event type and parse accordingly
        let lambdaEvent: LambdaEvent;
        let isApiGatewayEvent = false;

        if ('body' in event) {
            // API Gateway event
            isApiGatewayEvent = true;

            // Rate limiting for API Gateway events
            const clientId =
                event.requestContext?.identity?.sourceIp || 'unknown';
            if (!checkRateLimit(clientId, 10, 60000)) {
                // 10 requests per minute
                log({
                    level: 'WARN',
                    message: 'Rate limit exceeded',
                    context: { clientId },
                    requestId,
                });

                return createResponse(429, {
                    error: 'Rate limit exceeded',
                    message: 'Too many requests. Please try again later.',
                });
            }

            if (event.body) {
                try {
                    const parsedEvent = JSON.parse(event.body);
                    lambdaEvent = validateLambdaEvent(parsedEvent);
                } catch (parseError) {
                    metrics.totalErrors++;
                    return createResponse(400, {
                        error: 'Invalid request',
                        details:
                            parseError instanceof Error
                                ? parseError.message
                                : 'Unknown parsing error',
                    });
                }
            } else {
                // Use default values if no body provided
                lambdaEvent = validateLambdaEvent({
                    filePath: 'daily-commit.txt',
                    newContent: `Daily commit - ${new Date().toISOString()}`,
                    commitMessage: `Daily commit - ${new Date().toLocaleDateString()}`,
                    secretName:
                        process.env.SECRET_NAME || 'daily-commit-secrets',
                });
            }
        } else {
            // EventBridge event (cron)
            lambdaEvent = validateLambdaEvent({
                filePath: 'daily-commit.txt',
                newContent: `Daily commit - ${new Date().toISOString()}`,
                commitMessage: `Daily commit - ${new Date().toLocaleDateString()}`,
                secretName: process.env.SECRET_NAME || 'daily-commit-secrets',
            });
        }

        timer.checkpoint('validation');

        // Health check for EventBridge events
        if (!isApiGatewayEvent) {
            const health = await healthCheck();
            if (!health.healthy) {
                log({
                    level: 'ERROR',
                    message: 'Health check failed',
                    context: health.details,
                    requestId,
                });
                throw new Error('Health check failed');
            }
        }

        // Get git configuration from Secrets Manager
        log({
            level: 'INFO',
            message: 'Retrieving git configuration from Secrets Manager',
            context: { secretName: lambdaEvent.secretName },
            requestId,
        });

        const gitConfig = await getGitConfigFromSecrets(
            lambdaEvent.secretName!
        );
        metrics.secretsRetrievalSuccess = true;
        timer.checkpoint('secrets');

        // Step 1: Modify the text file
        log({
            level: 'INFO',
            message: 'Modifying text file',
            context: { filePath: lambdaEvent.filePath },
            requestId,
        });

        const fileResult = await modifyTextFile(
            lambdaEvent.filePath!,
            lambdaEvent.newContent!
        );

        if (!fileResult.success) {
            metrics.totalErrors++;
            const errorResponse = {
                error: 'Failed to modify file',
                details: fileResult.message,
            };

            log({
                level: 'ERROR',
                message: 'File modification failed',
                context: errorResponse,
                requestId,
            });

            if (isApiGatewayEvent) {
                return createResponse(500, errorResponse);
            } else {
                throw new Error(`Failed to modify file: ${fileResult.message}`);
            }
        }

        metrics.fileModificationSuccess = true;
        timer.checkpoint('file-modification');

        // Step 2: Perform git operations
        log({
            level: 'INFO',
            message: 'Performing git operations',
            context: {
                filePath: lambdaEvent.filePath,
                commitMessage: lambdaEvent.commitMessage,
            },
            requestId,
        });

        await performGitWorkflow(
            lambdaEvent.filePath!,
            lambdaEvent.commitMessage!,
            gitConfig
        );

        metrics.gitOperationSuccess = true;
        timer.checkpoint('git-operations');

        // Success response
        const response = {
            message: 'File modified and changes committed successfully',
            filePath: lambdaEvent.filePath,
            commitMessage: lambdaEvent.commitMessage,
            timestamp: new Date().toISOString(),
            fileModification: fileResult,
            executionTime: timer.getElapsed(),
            requestId,
        };

        log({
            level: 'INFO',
            message: 'Lambda function completed successfully',
            context: {
                executionTime: timer.getElapsed(),
                timings: timer.getAllTimings(),
            },
            requestId,
        });

        metrics.executionDuration = timer.getElapsed();

        if (isApiGatewayEvent) {
            return createResponse(200, response);
        } else {
            // For EventBridge events, just log success
            log({
                level: 'INFO',
                message: 'EventBridge execution completed',
                context: response,
                requestId,
            });
        }
    } catch (error) {
        metrics.totalErrors++;
        metrics.executionDuration = timer.getElapsed();

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        log({
            level: 'ERROR',
            message: 'Lambda function failed',
            context: {
                error: errorMessage,
                executionTime: timer.getElapsed(),
                timings: timer.getAllTimings(),
            },
            requestId,
        });

        const errorResponse = {
            error: 'Internal server error',
            details: errorMessage,
            timestamp: new Date().toISOString(),
            requestId,
        };

        // Check if this is an API Gateway event to determine response type
        const isApiGatewayEvent = 'body' in event;
        if (isApiGatewayEvent) {
            return createResponse(500, errorResponse);
        } else {
            // For EventBridge events, throw the error to mark the execution as failed
            throw error;
        }
    } finally {
        // Send metrics to CloudWatch
        try {
            await sendMetrics(metrics, process.env.AWS_LAMBDA_FUNCTION_NAME);
        } catch (metricError) {
            log({
                level: 'WARN',
                message: 'Failed to send metrics',
                context: {
                    error:
                        metricError instanceof Error
                            ? metricError.message
                            : 'Unknown error',
                },
                requestId,
            });
        }
    }
};

/**
 * Creates a standardized Lambda response with security headers
 * @param statusCode - HTTP status code
 * @param body - Response body object
 * @returns APIGatewayProxyResult
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
        },
        body: JSON.stringify(body, null, 2),
    };
}
