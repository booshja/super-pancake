import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { optimizedHealthCheck as healthCheck } from './monitoringOptimized';
import { getCachedGitConfig as getGitConfigFromSecrets } from './secretsCache';

/**
 * Health check handler for API Gateway
 * @param event - API Gateway event
 * @returns Health status response
 */
export const healthHandler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
        const health = await healthCheck();

        // Test Secrets Manager access
        try {
            const secretName =
                process.env.SECRET_NAME || 'daily-commit-secrets';
            await getGitConfigFromSecrets(secretName);
            health.details.secretsManagerAccess = true;
        } catch (error) {
            health.details.secretsManagerAccess = false;
            health.details.secretsManagerError =
                error instanceof Error ? error.message : 'Unknown error';
            health.healthy = false;
        }

        const statusCode = health.healthy ? 200 : 503;

        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
            },
            body: JSON.stringify({
                status: health.healthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                details: health.details,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
