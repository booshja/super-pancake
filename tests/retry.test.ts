import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';
import { withRetry, DEFAULT_RETRY_CONFIG, RETRY_CONFIGS } from '../src/retry';

describe('Retry Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('withRetry', () => {
        it('should succeed on first attempt', async () => {
            const mockFn = (jest.fn() as any as any).mockResolvedValue(
                'success'
            );

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and eventually succeed', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValue('success');

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });

        it('should fail after max attempts', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

            await expect(
                withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test')
            ).rejects.toThrow('ECONNRESET');

            expect(mockFn).toHaveBeenCalledTimes(2); // maxAttempts in development
        });

        it('should not retry non-retryable errors', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValue(new Error('Validation failed'));

            await expect(
                withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test')
            ).rejects.toThrow('Validation failed');

            expect(mockFn).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
        });

        it('should use exponential backoff with jitter', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValue('success');

            const startTime = Date.now();
            await withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test');
            const endTime = Date.now();

            expect(mockFn).toHaveBeenCalledTimes(2);
            // Should have waited at least some delay (with jitter it might be less than base delay)
            expect(endTime - startTime).toBeGreaterThanOrEqual(500);
        });

        it('should respect max delay', async () => {
            const config = {
                ...DEFAULT_RETRY_CONFIG,
                baseDelayMs: 1000,
                maxDelayMs: 2000,
                backoffMultiplier: 10, // Large multiplier to test max delay
            };

            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValue('success');

            const startTime = Date.now();
            await withRetry(mockFn as any, config, 'test');
            const endTime = Date.now();

            // Should not exceed max delay
            expect(endTime - startTime).toBeLessThan(3000);
        });

        it('should handle custom retry configuration', async () => {
            const customConfig = {
                maxAttempts: 2,
                baseDelayMs: 100,
                maxDelayMs: 500,
                backoffMultiplier: 2,
                jitter: false,
            };

            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValue('success');

            const result = await withRetry(mockFn as any, customConfig, 'test');

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('RETRY_CONFIGS', () => {
        it('should have git retry configuration', () => {
            expect(RETRY_CONFIGS.git).toBeDefined();
            expect(RETRY_CONFIGS.git.maxAttempts).toBe(3);
        });

        it('should have secrets retry configuration', () => {
            expect(RETRY_CONFIGS.secrets).toBeDefined();
            expect(RETRY_CONFIGS.secrets.maxAttempts).toBe(2);
        });

        it('should have file retry configuration', () => {
            expect(RETRY_CONFIGS.file).toBeDefined();
            expect(RETRY_CONFIGS.file.maxAttempts).toBe(1);
        });
    });

    describe('Error Classification', () => {
        it('should classify network errors as retryable', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValue('success');

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });

        it('should classify timeout errors as retryable', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(new Error('ETIMEDOUT'))
                .mockResolvedValue('success');

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });

        it('should classify validation errors as non-retryable', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValue(new Error('Validation failed'));

            await expect(
                withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test')
            ).rejects.toThrow('Validation failed');

            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should classify authentication errors as non-retryable', async () => {
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest
                .fn()
                .mockRejectedValue(new Error('Unauthorized'));

            await expect(
                withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test')
            ).rejects.toThrow('Unauthorized');

            expect(mockFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle function that throws non-Error objects', async () => {
            const mockFn = (jest.fn() as any).mockRejectedValue(
                'String error' as any
            );

            await expect(
                withRetry(mockFn as any, DEFAULT_RETRY_CONFIG, 'test')
            ).rejects.toThrow(
                'test - Failed after 2 attempts. Last error: String error'
            );

            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should handle function that returns undefined', async () => {
            const mockFn = (jest.fn() as any).mockResolvedValue(
                undefined as any
            );

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBeUndefined();
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should handle function that returns null', async () => {
            const mockFn = (jest.fn() as any).mockResolvedValue(null as any);

            const result = await withRetry(
                mockFn as any,
                DEFAULT_RETRY_CONFIG,
                'test'
            );

            expect(result).toBeNull();
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it('should handle zero max attempts', async () => {
            const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 0 };
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));

            await expect(
                withRetry(mockFn as any, config, 'test')
            ).rejects.toThrow(
                'test - Failed after 0 attempts. Last error: undefined'
            );
            expect(mockFn).toHaveBeenCalledTimes(0);
        });

        it('should handle negative max attempts', async () => {
            const config = { ...DEFAULT_RETRY_CONFIG, maxAttempts: -1 };
            // @ts-ignore - Jest mock typing issues
            const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));

            await expect(
                withRetry(mockFn as any, config, 'test')
            ).rejects.toThrow(
                'test - Failed after -1 attempts. Last error: undefined'
            );
            expect(mockFn).toHaveBeenCalledTimes(0);
        });
    });
});
