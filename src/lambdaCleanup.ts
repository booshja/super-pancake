import { clearSecretsCache, getCacheStats } from './secretsCache';
import { executeGitCommand } from './gitNative';

/**
 * Cleans up Lambda state to prevent memory leaks and state persistence issues
 */
export async function cleanupLambdaState(): Promise<void> {
    try {
        console.log('Starting Lambda state cleanup...');

        // 1. Clear secrets cache
        clearSecretsCache();
        console.log('Secrets cache cleared');

        // 2. Clear metrics cache (reset to empty array)
        if (typeof global !== 'undefined' && (global as any).metricsCache) {
            (global as any).metricsCache = [];
            console.log('Metrics cache cleared');
        }

        // 3. Reset git state
        await resetGitState();

        // 4. Clear any temporary files (if any)
        // This is a placeholder for any temp file cleanup

        console.log('Lambda state cleanup completed successfully');
    } catch (error) {
        console.error('Failed to cleanup Lambda state:', error);
        // Don't throw - cleanup failure shouldn't break the main function
    }
}

/**
 * Resets git repository state to prevent issues from previous invocations
 */
async function resetGitState(): Promise<void> {
    try {
        // Check if we're in a git repository
        try {
            await executeGitCommand('git rev-parse --git-dir');
        } catch {
            // Not a git repository, nothing to reset
            return;
        }

        // Reset any local changes
        try {
            await executeGitCommand('git reset --hard HEAD');
            console.log('Git repository reset to HEAD');
        } catch (error) {
            console.warn('Failed to reset git repository:', error);
        }

        // Clean untracked files
        try {
            await executeGitCommand('git clean -fd');
            console.log('Git untracked files cleaned');
        } catch (error) {
            console.warn('Failed to clean untracked files:', error);
        }

        // Note: We don't reset remote URL here as it will be set fresh in each run
    } catch (error) {
        console.warn('Failed to reset git state:', error);
        // Don't throw - git reset failure shouldn't break the main function
    }
}

/**
 * Forces sending of any cached metrics before Lambda termination
 */
export async function forceSendMetrics(): Promise<void> {
    try {
        // Access the metrics cache from the monitoring module
        if (typeof global !== 'undefined' && (global as any).metricsCache) {
            const metricsCache = (global as any).metricsCache;
            if (metricsCache.length > 0) {
                console.log(
                    `Force sending ${metricsCache.length} cached metrics`
                );

                // Import and call the sendBatchedMetrics function
                const { sendBatchedMetrics } = await import(
                    './monitoringOptimized'
                );
                await sendBatchedMetrics(
                    process.env.AWS_LAMBDA_FUNCTION_NAME || 'daily-commit'
                );

                console.log('Cached metrics sent successfully');
            }
        }
    } catch (error) {
        console.error('Failed to force send metrics:', error);
        // Don't throw - metrics failure shouldn't break the main function
    }
}

/**
 * Gets current Lambda state information for debugging
 */
export function getLambdaStateInfo(): {
    secretsCache: { size: number; entries: string[] };
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
} {
    return {
        secretsCache: getCacheStats(),
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
    };
}

/**
 * Validates that the Lambda environment is clean and ready
 */
export function validateLambdaEnvironment(): {
    valid: boolean;
    issues: string[];
} {
    const issues: string[] = [];

    // Check memory usage
    const memUsage = process.memoryUsage();
    if (memUsage.heapUsed > 100 * 1024 * 1024) {
        // 100MB
        issues.push(
            `High memory usage: ${Math.round(
                memUsage.heapUsed / 1024 / 1024
            )}MB`
        );
    }

    // Check secrets cache size
    const cacheStats = getCacheStats();
    if (cacheStats.size > 10) {
        issues.push(`Large secrets cache: ${cacheStats.size} entries`);
    }

    // Check uptime (should be low for fresh Lambda)
    if (process.uptime() > 300) {
        // 5 minutes
        issues.push(`Long uptime: ${Math.round(process.uptime())}s`);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}
