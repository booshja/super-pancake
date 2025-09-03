import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';
import {
    cleanupLambdaState,
    forceSendMetrics,
    validateLambdaEnvironment,
    getLambdaStateInfo,
} from '../src/lambdaCleanup';
import { clearSecretsCache, getCacheStats } from '../src/secretsCache';
import { sendBatchedMetrics } from '../src/monitoringOptimized';

// Mock dependencies
jest.mock('../src/secretsCache');
jest.mock('../src/monitoringOptimized');
jest.mock('../src/gitNative');

describe('Lambda Cleanup Module', () => {
    const mockClearSecretsCache = clearSecretsCache as jest.MockedFunction<
        typeof clearSecretsCache
    >;
    const mockGetCacheStats = getCacheStats as jest.MockedFunction<
        typeof getCacheStats
    >;
    const mockSendBatchedMetrics = sendBatchedMetrics as jest.MockedFunction<
        typeof sendBatchedMetrics
    >;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock git commands
        const { executeGitCommand } = require('../src/gitNative');
        executeGitCommand.mockResolvedValue('success');

        // Reset global metrics cache
        if (typeof global !== 'undefined') {
            (global as any).metricsCache = [];
        }
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('cleanupLambdaState', () => {
        it('should clear secrets cache', async () => {
            mockClearSecretsCache.mockImplementation(() => {});

            await cleanupLambdaState();

            expect(mockClearSecretsCache).toHaveBeenCalledTimes(1);
        });

        it('should clear metrics cache', async () => {
            // Set up global metrics cache
            if (typeof global !== 'undefined') {
                (global as any).metricsCache = [
                    {
                        executionDuration: 1000,
                        success: true,
                        errorCount: 0,
                        retryCount: 0,
                    },
                ];
            }

            await cleanupLambdaState();

            expect((global as any).metricsCache).toEqual([]);
        });

        it('should reset git state', async () => {
            const { executeGitCommand } = require('../src/gitNative');

            await cleanupLambdaState();

            expect(executeGitCommand).toHaveBeenCalledWith(
                'git reset --hard HEAD'
            );
            expect(executeGitCommand).toHaveBeenCalledWith('git clean -fd');
        });

        it('should handle git reset errors gracefully', async () => {
            const { executeGitCommand } = require('../src/gitNative');
            executeGitCommand
                .mockResolvedValueOnce('.git') // git rev-parse --git-dir succeeds
                .mockRejectedValueOnce(new Error('Git reset failed')); // git reset fails

            // Should not throw error
            await expect(cleanupLambdaState()).resolves.not.toThrow();

            expect(executeGitCommand).toHaveBeenCalledWith(
                'git reset --hard HEAD'
            );
        });

        it('should handle git clean errors gracefully', async () => {
            const { executeGitCommand } = require('../src/gitNative');
            executeGitCommand
                .mockResolvedValueOnce('success') // git reset succeeds
                .mockRejectedValueOnce(new Error('Git clean failed')); // git clean fails

            // Should not throw error
            await expect(cleanupLambdaState()).resolves.not.toThrow();

            expect(executeGitCommand).toHaveBeenCalledWith('git clean -fd');
        });

        it('should handle secrets cache errors gracefully', async () => {
            mockClearSecretsCache.mockImplementation(() => {
                throw new Error('Cache clear failed');
            });

            // Should not throw error
            await expect(cleanupLambdaState()).resolves.not.toThrow();
        });
    });

    describe('forceSendMetrics', () => {
        it('should send metrics when cache has data', async () => {
            // Set up global metrics cache with data
            if (typeof global !== 'undefined') {
                (global as any).metricsCache = [
                    {
                        executionDuration: 1000,
                        success: true,
                        errorCount: 0,
                        retryCount: 0,
                    },
                ];
            }

            mockSendBatchedMetrics.mockResolvedValue(undefined);

            await forceSendMetrics();

            expect(mockSendBatchedMetrics).toHaveBeenCalledTimes(1);
            expect(mockSendBatchedMetrics).toHaveBeenCalledWith(
                process.env.AWS_LAMBDA_FUNCTION_NAME || 'daily-commit'
            );
        });

        it('should not send metrics when cache is empty', async () => {
            // Ensure cache is empty
            if (typeof global !== 'undefined') {
                (global as any).metricsCache = [];
            }

            await forceSendMetrics();

            expect(mockSendBatchedMetrics).not.toHaveBeenCalled();
        });

        it('should handle sendBatchedMetrics errors gracefully', async () => {
            // Set up global metrics cache with data
            if (typeof global !== 'undefined') {
                (global as any).metricsCache = [
                    {
                        executionDuration: 1000,
                        success: true,
                        errorCount: 0,
                        retryCount: 0,
                    },
                ];
            }

            mockSendBatchedMetrics.mockRejectedValue(
                new Error('CloudWatch error')
            );

            // Should not throw error
            await expect(forceSendMetrics()).resolves.not.toThrow();
        });

        it('should handle missing global metrics cache', async () => {
            // Remove global metrics cache
            if (typeof global !== 'undefined') {
                delete (global as any).metricsCache;
            }

            // Should not throw error
            await expect(forceSendMetrics()).resolves.not.toThrow();

            expect(mockSendBatchedMetrics).not.toHaveBeenCalled();
        });
    });

    describe('validateLambdaEnvironment', () => {
        const originalMemoryUsage = process.memoryUsage;
        const originalUptime = process.uptime;

        beforeEach(() => {
            process.memoryUsage = jest.fn() as any;
            process.uptime = jest.fn() as any;
        });

        afterEach(() => {
            process.memoryUsage = originalMemoryUsage;
            process.uptime = originalUptime;
        });

        it('should return valid for clean environment', () => {
            (process.memoryUsage as any).mockReturnValue({
                heapUsed: 50 * 1024 * 1024, // 50MB
                heapTotal: 100 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                rss: 200 * 1024 * 1024,
            });

            (process.uptime as any).mockReturnValue(30); // 30 seconds

            mockGetCacheStats.mockReturnValue({
                size: 2,
                entries: ['secret1', 'secret2'],
            });

            const result = validateLambdaEnvironment();

            expect(result.valid).toBe(true);
            expect(result.issues).toEqual([]);
        });

        it('should detect high memory usage', () => {
            (process.memoryUsage as any).mockReturnValue({
                heapUsed: 150 * 1024 * 1024, // 150MB (over 100MB limit)
                heapTotal: 200 * 1024 * 1024,
                external: 20 * 1024 * 1024,
                rss: 300 * 1024 * 1024,
            });

            (process.uptime as any).mockReturnValue(30);

            mockGetCacheStats.mockReturnValue({
                size: 2,
                entries: ['secret1', 'secret2'],
            });

            const result = validateLambdaEnvironment();

            expect(result.valid).toBe(false);
            expect(result.issues).toContain('High memory usage: 150MB');
        });

        it('should detect large secrets cache', () => {
            (process.memoryUsage as any).mockReturnValue({
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                rss: 200 * 1024 * 1024,
            });

            (process.uptime as any).mockReturnValue(30);

            mockGetCacheStats.mockReturnValue({
                size: 15, // Over 10 limit
                entries: Array.from({ length: 15 }, (_, i) => `secret${i}`),
            });

            const result = validateLambdaEnvironment();

            expect(result.valid).toBe(false);
            expect(result.issues).toContain('Large secrets cache: 15 entries');
        });

        it('should detect long uptime', () => {
            (process.memoryUsage as any).mockReturnValue({
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                rss: 200 * 1024 * 1024,
            });

            (process.uptime as any).mockReturnValue(400); // 400 seconds (over 300 limit)

            mockGetCacheStats.mockReturnValue({
                size: 2,
                entries: ['secret1', 'secret2'],
            });

            const result = validateLambdaEnvironment();

            expect(result.valid).toBe(false);
            expect(result.issues).toContain('Long uptime: 400s');
        });

        it('should detect multiple issues', () => {
            (process.memoryUsage as any).mockReturnValue({
                heapUsed: 150 * 1024 * 1024, // High memory
                heapTotal: 200 * 1024 * 1024,
                external: 20 * 1024 * 1024,
                rss: 300 * 1024 * 1024,
            });

            (process.uptime as any).mockReturnValue(400); // Long uptime

            mockGetCacheStats.mockReturnValue({
                size: 15, // Large cache
                entries: Array.from({ length: 15 }, (_, i) => `secret${i}`),
            });

            const result = validateLambdaEnvironment();

            expect(result.valid).toBe(false);
            expect(result.issues).toHaveLength(3);
            expect(result.issues).toContain('High memory usage: 150MB');
            expect(result.issues).toContain('Large secrets cache: 15 entries');
            expect(result.issues).toContain('Long uptime: 400s');
        });
    });

    describe('getLambdaStateInfo', () => {
        it('should return current state information', () => {
            const originalMemoryUsage = process.memoryUsage;
            const originalUptime = process.uptime;

            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                rss: 200 * 1024 * 1024,
                arrayBuffers: 0,
            });

            jest.spyOn(process, 'uptime').mockReturnValue(120);

            mockGetCacheStats.mockReturnValue({
                size: 3,
                entries: ['secret1', 'secret2', 'secret3'],
            });

            const result = getLambdaStateInfo();

            expect(result).toEqual({
                secretsCache: {
                    size: 3,
                    entries: ['secret1', 'secret2', 'secret3'],
                },
                memoryUsage: {
                    heapUsed: 50 * 1024 * 1024,
                    heapTotal: 100 * 1024 * 1024,
                    external: 10 * 1024 * 1024,
                    rss: 200 * 1024 * 1024,
                    arrayBuffers: 0,
                },
                uptime: 120,
            });

            process.memoryUsage = originalMemoryUsage;
            process.uptime = originalUptime;
        });
    });
});
