import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    Context,
} from 'aws-lambda';
import { modifyTextFile } from './fileOperations';
import { performGitWorkflow } from './gitNative';
import { getCachedGitConfig } from './secretsCache';
import { validateLambdaEvent, checkRateLimit } from './validation';
import {
    sendOptimizedMetrics,
    logOptimized,
    OptimizedTimer,
    optimizedHealthCheck,
} from './monitoringOptimized';
import {
    cleanupLambdaState,
    forceSendMetrics,
    validateLambdaEnvironment,
} from './lambdaCleanup';
import { validateEnvironment } from './config';
import { LambdaEvent, EventBridgeEvent } from './types';

/**
 * Optimized Lambda handler for cost efficiency
 * Supports both API Gateway and EventBridge events
 * @param event - API Gateway or EventBridge event
 * @param context - Lambda context
 * @returns Promise<APIGatewayProxyResult | void>
 */
export const handler = async (
    event: APIGatewayProxyEvent | EventBridgeEvent,
    context: Context
): Promise<APIGatewayProxyResult | void> => {
    const timer = new OptimizedTimer();
    const requestId = context.awsRequestId;
    let metrics = {
        executionDuration: 0,
        success: false,
        errorCount: 0,
        retryCount: 0,
    };

    try {
        // 1. Cleanup from previous invocations
        await cleanupLambdaState();

        // 2. Validate environment
        const envValidation = validateLambdaEnvironment();
        if (!envValidation.valid) {
            logOptimized('WARN', 'Lambda environment issues detected', {
                issues: envValidation.issues,
            });
        }

        // 3. Validate configuration
        const configValidation = validateEnvironment();
        if (!configValidation.valid) {
            logOptimized('ERROR', 'Missing required environment variables', {
                missing: configValidation.missing,
            });
            throw new Error(
                `Missing required environment variables: ${configValidation.missing.join(
                    ', '
                )}`
            );
        }
        if (configValidation.warnings.length > 0) {
            logOptimized('WARN', 'Environment configuration warnings', {
                warnings: configValidation.warnings,
            });
        }

        logOptimized('INFO', 'Lambda function started', {
            eventType: 'body' in event ? 'API Gateway' : 'EventBridge',
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
                logOptimized('WARN', 'Rate limit exceeded', { clientId });

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
                    metrics.errorCount++;
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

        // Lightweight health check for EventBridge events
        if (!isApiGatewayEvent) {
            const health = await optimizedHealthCheck();
            if (!health.healthy) {
                logOptimized('ERROR', 'Health check failed', health.details);
                throw new Error('Health check failed');
            }
        }

        // Get git configuration from cached secrets
        logOptimized(
            'INFO',
            'Retrieving git configuration from cached secrets',
            {
                secretName: lambdaEvent.secretName,
            }
        );

        const gitConfig = await getCachedGitConfig(lambdaEvent.secretName!);
        timer.checkpoint('secrets');

        // Step 1: Modify the text file
        logOptimized('INFO', 'Modifying text file', {
            filePath: lambdaEvent.filePath,
        });

        const fileResult = await modifyTextFile(
            lambdaEvent.filePath!,
            lambdaEvent.newContent!
        );

        if (!fileResult.success) {
            metrics.errorCount++;
            const errorResponse = {
                error: 'Failed to modify file',
                details: fileResult.message,
            };

            logOptimized('ERROR', 'File modification failed', errorResponse);

            if (isApiGatewayEvent) {
                return createResponse(500, errorResponse);
            } else {
                throw new Error(`Failed to modify file: ${fileResult.message}`);
            }
        }

        timer.checkpoint('file-modification');

        // Step 2: Perform git operations
        logOptimized('INFO', 'Performing git operations', {
            filePath: lambdaEvent.filePath,
            commitMessage: lambdaEvent.commitMessage,
        });

        await performGitWorkflow(
            lambdaEvent.filePath!,
            lambdaEvent.commitMessage!,
            gitConfig
        );

        timer.checkpoint('git-operations');

        // Success response
        const response = {
            message: 'File modified and changes committed successfully',
            filePath: lambdaEvent.filePath,
            commitMessage: lambdaEvent.commitMessage,
            timestamp: new Date().toISOString(),
            executionTime: timer.getElapsed(),
            requestId,
        };

        logOptimized('INFO', 'Lambda function completed successfully', {
            executionTime: timer.getElapsed(),
        });

        metrics.executionDuration = timer.getElapsed();
        metrics.success = true;

        if (isApiGatewayEvent) {
            return createResponse(200, response);
        } else {
            // For EventBridge events, just log success
            logOptimized('INFO', 'EventBridge execution completed', response);
        }
    } catch (error) {
        metrics.errorCount++;
        metrics.executionDuration = timer.getElapsed();

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        logOptimized('ERROR', 'Lambda function failed', {
            error: errorMessage,
            executionTime: timer.getElapsed(),
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
        // Always cleanup and send metrics before Lambda termination
        try {
            // Send any cached metrics
            await forceSendMetrics();

            // Send current execution metrics
            await sendOptimizedMetrics(
                metrics,
                process.env.AWS_LAMBDA_FUNCTION_NAME
            );

            // Final cleanup
            await cleanupLambdaState();
        } catch (cleanupError) {
            logOptimized('WARN', 'Failed to cleanup or send metrics', {
                error:
                    cleanupError instanceof Error
                        ? cleanupError.message
                        : 'Unknown error',
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
