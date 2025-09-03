import {
    CloudWatchClient,
    PutMetricDataCommand,
    StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { getConfig } from './config';

// Initialize CloudWatch client
let cloudWatchClient = new CloudWatchClient({
    region: process.env.AWS_REGION || 'us-west-2',
});

// Export for testing
export { cloudWatchClient };

/**
 * Optimized metrics for cost-effective monitoring
 */
export interface OptimizedMetrics {
    executionDuration: number;
    success: boolean;
    errorCount: number;
    retryCount: number;
}

// Cache for metrics to batch them and reduce API calls
let metricsCache: OptimizedMetrics[] = [];
let lastMetricsSend = 0;

// Get environment-specific configuration
const config = getConfig();
const METRICS_BATCH_SIZE = config.metricsBatchSize;
const METRICS_BATCH_TIMEOUT = 300000; // 5 minutes

// Expose metrics cache globally for cleanup access
if (typeof global !== 'undefined') {
    (global as any).metricsCache = metricsCache;
}

/**
 * Sends batched metrics to CloudWatch to reduce costs
 * @param metrics - Metrics to send
 * @param functionName - Lambda function name
 */
export async function sendOptimizedMetrics(
    metrics: OptimizedMetrics,
    functionName: string = 'daily-commit'
): Promise<void> {
    try {
        // Add to cache
        metricsCache.push(metrics);

        const now = Date.now();
        const shouldSend =
            metricsCache.length >= METRICS_BATCH_SIZE ||
            now - lastMetricsSend > METRICS_BATCH_TIMEOUT;

        if (shouldSend) {
            await sendBatchedMetrics(functionName);
        }
    } catch (error) {
        console.error('Failed to cache metrics:', error);
        // Don't throw - metrics failure shouldn't break the main function
    }
}

/**
 * Sends batched metrics to CloudWatch
 */
export async function sendBatchedMetrics(functionName: string): Promise<void> {
    if (metricsCache.length === 0) return;

    try {
        const timestamp = new Date();

        // Aggregate metrics to reduce the number of API calls
        const aggregatedMetrics = {
            totalExecutions: metricsCache.length,
            successfulExecutions: metricsCache.filter((m) => m.success).length,
            failedExecutions: metricsCache.filter((m) => !m.success).length,
            averageDuration:
                metricsCache.reduce((sum, m) => sum + m.executionDuration, 0) /
                metricsCache.length,
            totalErrors: metricsCache.reduce((sum, m) => sum + m.errorCount, 0),
            totalRetries: metricsCache.reduce(
                (sum, m) => sum + m.retryCount,
                0
            ),
        };

        const metricData = [
            {
                MetricName: 'TotalExecutions',
                Value: aggregatedMetrics.totalExecutions,
                Unit: StandardUnit.Count,
                Timestamp: timestamp,
            },
            {
                MetricName: 'SuccessRate',
                Value:
                    aggregatedMetrics.successfulExecutions /
                    aggregatedMetrics.totalExecutions,
                Unit: StandardUnit.Percent,
                Timestamp: timestamp,
            },
            {
                MetricName: 'AverageExecutionDuration',
                Value: aggregatedMetrics.averageDuration,
                Unit: StandardUnit.Milliseconds,
                Timestamp: timestamp,
            },
            {
                MetricName: 'TotalErrors',
                Value: aggregatedMetrics.totalErrors,
                Unit: StandardUnit.Count,
                Timestamp: timestamp,
            },
            {
                MetricName: 'TotalRetries',
                Value: aggregatedMetrics.totalRetries,
                Unit: StandardUnit.Count,
                Timestamp: timestamp,
            },
        ];

        const command = new PutMetricDataCommand({
            Namespace: `Lambda/${functionName}`,
            MetricData: metricData,
        });

        await cloudWatchClient.send(command);
        console.log(
            `Sent ${metricsCache.length} batched metrics to CloudWatch`
        );

        // Clear cache and update timestamp
        metricsCache = [];
        lastMetricsSend = Date.now();
    } catch (error) {
        console.error('Failed to send batched metrics to CloudWatch:', error);
        // Clear cache even on failure to prevent memory leaks
        metricsCache = [];
    }
}

/**
 * Lightweight logging function for cost optimization
 * @param level - Log level
 * @param message - Log message
 * @param context - Additional context
 */
export function logOptimized(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: Record<string, any>
): void {
    const logEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        requestId: process.env.AWS_REQUEST_ID || 'unknown',
        ...context,
    };

    // Use environment-specific logging configuration
    const config = getConfig();
    const shouldLog =
        config.logLevel === 'INFO' ||
        (config.logLevel === 'WARN' &&
            (level === 'WARN' || level === 'ERROR')) ||
        (config.logLevel === 'ERROR' && level === 'ERROR');

    if (shouldLog) {
        console.log(JSON.stringify(logEntry));
    }
}

/**
 * Optimized performance timer
 */
export class OptimizedTimer {
    private startTime: number;
    private checkpoints: Map<string, number> = new Map();

    constructor() {
        this.startTime = Date.now();
    }

    /**
     * Records a checkpoint (only in development)
     * @param name - Checkpoint name
     */
    checkpoint(name: string): void {
        if (process.env.NODE_ENV !== 'production') {
            this.checkpoints.set(name, Date.now());
            logOptimized('INFO', `Checkpoint: ${name}`, {
                elapsedMs: Date.now() - this.startTime,
            });
        }
    }

    /**
     * Gets elapsed time since start
     * @returns Elapsed time in milliseconds
     */
    getElapsed(): number {
        return Date.now() - this.startTime;
    }
}

/**
 * Lightweight health check
 * @returns Health status
 */
export async function optimizedHealthCheck(): Promise<{
    healthy: boolean;
    details: Record<string, any>;
}> {
    const details: Record<string, any> = {};
    let healthy = true;

    try {
        // Basic environment check
        details.environment = {
            secretName: !!process.env.SECRET_NAME,
            awsRegion: !!process.env.AWS_REGION,
        };

        // Memory usage check
        const memUsage = process.memoryUsage();
        details.memory = {
            used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        };

        // Warning if memory usage is high
        if (memUsage.heapUsed > 50 * 1024 * 1024) {
            // 50MB
            details.memoryWarning = 'High memory usage detected';
        }
    } catch (error) {
        details.error =
            error instanceof Error ? error.message : 'Unknown error';
        healthy = false;
    }

    return { healthy, details };
}
