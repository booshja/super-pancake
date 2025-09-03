import { getConfig } from './config';

/**
 * Retry configuration interface
 */
export interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitter: boolean;
}

/**
 * Default retry configuration using environment settings
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = (() => {
    const config = getConfig();
    return {
        maxAttempts: config.maxRetries,
        baseDelayMs: config.baseDelayMs,
        maxDelayMs: config.maxDelayMs,
        backoffMultiplier: 2,
        jitter: true,
    };
})();

/**
 * Retryable error types
 */
export const RETRYABLE_ERRORS = [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENETUNREACH',
    'ThrottlingException',
    'ServiceUnavailableException',
    'TooManyRequestsException',
];

/**
 * Checks if an error is retryable
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString();
    const errorCode = error.code || error.name;

    return RETRYABLE_ERRORS.some(
        (retryableError) =>
            errorMessage.includes(retryableError) ||
            errorCode === retryableError
    );
}

/**
 * Calculates delay with exponential backoff and optional jitter
 * @param attempt - Current attempt number (0-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
    let delay =
        config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

    // Cap at maximum delay
    delay = Math.min(delay, config.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
}

/**
 * Executes a function with retry logic
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @param context - Context for logging
 * @returns Promise with the result
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    context: string = 'operation'
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
        try {
            console.log(
                `${context} - Attempt ${attempt + 1}/${config.maxAttempts}`
            );
            const result = await fn();

            if (attempt > 0) {
                console.log(`${context} - Succeeded on attempt ${attempt + 1}`);
            }

            return result;
        } catch (error) {
            lastError = error;

            console.error(`${context} - Attempt ${attempt + 1} failed:`, error);

            // Don't retry on the last attempt
            if (attempt === config.maxAttempts - 1) {
                break;
            }

            // Don't retry if error is not retryable
            if (!isRetryableError(error)) {
                console.log(
                    `${context} - Error is not retryable, failing immediately`
                );
                break;
            }

            // Calculate delay and wait
            const delay = calculateDelay(attempt, config);
            console.log(`${context} - Waiting ${delay}ms before retry`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw new Error(
        `${context} - Failed after ${
            config.maxAttempts
        } attempts. Last error: ${lastError?.message || lastError}`
    );
}

/**
 * Specific retry configurations for different operations
 */
export const RETRY_CONFIGS = {
    // Git operations can be flaky due to network issues
    git: {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        baseDelayMs: 2000,
    },

    // Secrets Manager operations
    secrets: {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 2,
        baseDelayMs: 1000,
    },

    // File operations (usually don't need retries)
    file: {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 1,
    },
} as const;
