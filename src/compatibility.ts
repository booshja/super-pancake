/**
 * Compatibility layer for the standard version to use optimized modules
 */

import {
    logOptimized,
    sendOptimizedMetrics,
    OptimizedTimer,
    optimizedHealthCheck,
} from './monitoringOptimized';
import { getCachedGitConfig } from './secretsCache';
import { OptimizedMetrics } from './monitoringOptimized';

// Re-export with original names for backward compatibility
export const log = (entry: {
    level: string;
    message: string;
    context?: any;
    requestId?: string;
}) => {
    logOptimized(
        entry.level as 'INFO' | 'WARN' | 'ERROR',
        entry.message,
        entry.context
    );
};

export const sendMetrics = async (metrics: any, functionName?: string) => {
    // Convert old metrics format to new format
    const optimizedMetrics: OptimizedMetrics = {
        executionDuration: metrics.executionDuration || 0,
        success:
            metrics.fileModificationSuccess &&
            metrics.gitOperationSuccess &&
            metrics.secretsRetrievalSuccess,
        errorCount: metrics.totalErrors || 0,
        retryCount: metrics.retryCount || 0,
    };

    await sendOptimizedMetrics(optimizedMetrics, functionName);
};

export class PerformanceTimer {
    private timer: OptimizedTimer;

    constructor() {
        this.timer = new OptimizedTimer();
    }

    checkpoint(name: string): void {
        this.timer.checkpoint(name);
    }

    getElapsed(): number {
        return this.timer.getElapsed();
    }

    getAllTimings(): Record<string, number> {
        // Return empty object for compatibility
        return {};
    }
}

export const healthCheck = optimizedHealthCheck;

// Re-export secrets function with original name
export const getGitConfigFromSecrets = getCachedGitConfig;
