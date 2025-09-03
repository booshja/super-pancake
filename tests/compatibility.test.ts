import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';
import {
    log,
    sendMetrics,
    PerformanceTimer,
    healthCheck,
    getGitConfigFromSecrets,
} from '../src/compatibility';

// Mock dependencies
jest.mock('../src/monitoringOptimized');
jest.mock('../src/secretsCache');

describe('Compatibility Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('log', () => {
        it('should call logOptimized with correct parameters', () => {
            const { logOptimized } = require('../src/monitoringOptimized');
            const mockLogOptimized = logOptimized as jest.MockedFunction<
                typeof logOptimized
            >;

            const logEntry = {
                level: 'INFO',
                message: 'Test message',
                context: { test: 'data' },
                requestId: 'test-request-id',
            };

            log(logEntry);

            expect(mockLogOptimized).toHaveBeenCalledWith(
                'INFO',
                'Test message',
                { test: 'data' }
            );
        });

        it('should handle missing context', () => {
            const { logOptimized } = require('../src/monitoringOptimized');
            const mockLogOptimized = logOptimized as jest.MockedFunction<
                typeof logOptimized
            >;

            const logEntry = {
                level: 'WARN',
                message: 'Warning message',
            };

            log(logEntry);

            expect(mockLogOptimized).toHaveBeenCalledWith(
                'WARN',
                'Warning message',
                undefined
            );
        });

        it('should handle different log levels', () => {
            const { logOptimized } = require('../src/monitoringOptimized');
            const mockLogOptimized = logOptimized as jest.MockedFunction<
                typeof logOptimized
            >;

            const levels = ['INFO', 'WARN', 'ERROR'];

            levels.forEach((level) => {
                log({ level, message: `${level} message` });
            });

            expect(mockLogOptimized).toHaveBeenCalledTimes(3);
            expect(mockLogOptimized).toHaveBeenCalledWith(
                'INFO',
                'INFO message',
                undefined
            );
            expect(mockLogOptimized).toHaveBeenCalledWith(
                'WARN',
                'WARN message',
                undefined
            );
            expect(mockLogOptimized).toHaveBeenCalledWith(
                'ERROR',
                'ERROR message',
                undefined
            );
        });
    });

    describe('sendMetrics', () => {
        it('should convert old metrics format to new format and send', async () => {
            const {
                sendOptimizedMetrics,
            } = require('../src/monitoringOptimized');
            const mockSendOptimizedMetrics =
                sendOptimizedMetrics as jest.MockedFunction<
                    typeof sendOptimizedMetrics
                >;

            const oldMetrics = {
                executionDuration: 1500,
                fileModificationSuccess: true,
                gitOperationSuccess: true,
                secretsRetrievalSuccess: true,
                totalErrors: 0,
                retryCount: 2,
            };

            await sendMetrics(oldMetrics, 'test-function');

            expect(mockSendOptimizedMetrics).toHaveBeenCalledWith(
                {
                    executionDuration: 1500,
                    success: true, // All three success flags are true
                    errorCount: 0,
                    retryCount: 2,
                },
                'test-function'
            );
        });

        it('should handle partial success in metrics', async () => {
            const {
                sendOptimizedMetrics,
            } = require('../src/monitoringOptimized');
            const mockSendOptimizedMetrics =
                sendOptimizedMetrics as jest.MockedFunction<
                    typeof sendOptimizedMetrics
                >;

            const oldMetrics = {
                executionDuration: 2000,
                fileModificationSuccess: true,
                gitOperationSuccess: false, // This fails
                secretsRetrievalSuccess: true,
                totalErrors: 1,
                retryCount: 0,
            };

            await sendMetrics(oldMetrics, 'test-function');

            expect(mockSendOptimizedMetrics).toHaveBeenCalledWith(
                {
                    executionDuration: 2000,
                    success: false, // Not all success flags are true
                    errorCount: 1,
                    retryCount: 0,
                },
                'test-function'
            );
        });

        it('should handle missing metrics fields', async () => {
            const {
                sendOptimizedMetrics,
            } = require('../src/monitoringOptimized');
            const mockSendOptimizedMetrics =
                sendOptimizedMetrics as jest.MockedFunction<
                    typeof sendOptimizedMetrics
                >;

            const incompleteMetrics = {
                executionDuration: 1000,
                // Missing other fields - the function will use defaults
            };

            await sendMetrics(incompleteMetrics, 'test-function');

            expect(mockSendOptimizedMetrics).toHaveBeenCalledWith(
                {
                    executionDuration: 1000,
                    success: undefined, // Missing success flags result in undefined (undefined && undefined && undefined = undefined)
                    errorCount: 0, // Missing field defaults to 0
                    retryCount: 0, // Missing field defaults to 0
                },
                'test-function'
            );
        });

        it('should use default function name when not provided', async () => {
            const {
                sendOptimizedMetrics,
            } = require('../src/monitoringOptimized');
            const mockSendOptimizedMetrics =
                sendOptimizedMetrics as jest.MockedFunction<
                    typeof sendOptimizedMetrics
                >;

            const metrics = {
                executionDuration: 1000,
                fileModificationSuccess: true,
                gitOperationSuccess: true,
                secretsRetrievalSuccess: true,
                totalErrors: 0,
                retryCount: 0,
            };

            await sendMetrics(metrics);

            expect(mockSendOptimizedMetrics).toHaveBeenCalledWith(
                expect.any(Object),
                undefined
            );
        });
    });

    describe('PerformanceTimer', () => {
        it('should create timer instance', () => {
            const timer = new PerformanceTimer();
            expect(timer).toBeInstanceOf(PerformanceTimer);
        });

        it('should delegate checkpoint calls to OptimizedTimer', () => {
            const { OptimizedTimer } = require('../src/monitoringOptimized');
            const mockOptimizedTimer = {
                checkpoint: jest.fn(),
                getElapsed: jest.fn().mockReturnValue(1000),
            };

            OptimizedTimer.mockImplementation(() => mockOptimizedTimer);

            const timer = new PerformanceTimer();
            timer.checkpoint('test-checkpoint');

            expect(mockOptimizedTimer.checkpoint).toHaveBeenCalledWith(
                'test-checkpoint'
            );
        });

        it('should delegate getElapsed calls to OptimizedTimer', () => {
            const { OptimizedTimer } = require('../src/monitoringOptimized');
            const mockOptimizedTimer = {
                checkpoint: jest.fn(),
                getElapsed: jest.fn().mockReturnValue(1500),
            };

            OptimizedTimer.mockImplementation(() => mockOptimizedTimer);

            const timer = new PerformanceTimer();
            const elapsed = timer.getElapsed();

            expect(mockOptimizedTimer.getElapsed).toHaveBeenCalled();
            expect(elapsed).toBe(1500);
        });

        it('should return empty object for getAllTimings', () => {
            const timer = new PerformanceTimer();
            const timings = timer.getAllTimings();

            expect(timings).toEqual({});
        });
    });

    describe('healthCheck', () => {
        it('should delegate to optimizedHealthCheck', async () => {
            const {
                optimizedHealthCheck,
            } = require('../src/monitoringOptimized');
            const mockOptimizedHealthCheck =
                optimizedHealthCheck as jest.MockedFunction<
                    typeof optimizedHealthCheck
                >;

            const mockHealthResult = {
                healthy: true,
                details: {
                    timestamp: '2024-01-01T00:00:00.000Z',
                    memory: { heapUsed: 50000000 },
                    environment: { secretName: true, awsRegion: true },
                },
            };

            mockOptimizedHealthCheck.mockResolvedValue(mockHealthResult);

            const result = await healthCheck();

            expect(mockOptimizedHealthCheck).toHaveBeenCalled();
            expect(result).toEqual(mockHealthResult);
        });
    });

    describe('getGitConfigFromSecrets', () => {
        it('should delegate to getCachedGitConfig', async () => {
            const { getCachedGitConfig } = require('../src/secretsCache');
            const mockGetCachedGitConfig =
                getCachedGitConfig as jest.MockedFunction<
                    typeof getCachedGitConfig
                >;

            const mockGitConfig = {
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            mockGetCachedGitConfig.mockResolvedValue(mockGitConfig);

            const result = await getGitConfigFromSecrets('test-secret');

            expect(mockGetCachedGitConfig).toHaveBeenCalledWith('test-secret');
            expect(result).toEqual(mockGitConfig);
        });

        it('should handle getCachedGitConfig errors', async () => {
            const { getCachedGitConfig } = require('../src/secretsCache');
            const mockGetCachedGitConfig =
                getCachedGitConfig as jest.MockedFunction<
                    typeof getCachedGitConfig
                >;

            mockGetCachedGitConfig.mockRejectedValue(
                new Error('Secrets error')
            );

            await expect(
                getGitConfigFromSecrets('test-secret')
            ).rejects.toThrow('Secrets error');
        });
    });
});
