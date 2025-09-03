/**
 * Environment-specific configuration for the Daily Commit Lambda
 */

export interface LambdaConfig {
    cacheTTL: number;
    metricsBatchSize: number;
    logLevel: 'INFO' | 'WARN' | 'ERROR';
    gitTimeout: number;
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

/**
 * Gets environment-specific configuration
 */
export function getConfig(): LambdaConfig {
    const env = process.env.NODE_ENV || 'development';
    const isProduction = env === 'production';

    return {
        // Cache TTL - shorter in dev for testing, longer in prod for efficiency
        cacheTTL: isProduction ? 300000 : 60000, // 5min prod, 1min dev

        // Metrics batching - immediate in dev, batched in prod
        metricsBatchSize: isProduction ? 10 : 1,

        // Logging level - verbose in dev, minimal in prod
        logLevel: isProduction ? 'ERROR' : 'INFO',

        // Git timeout - shorter in dev for faster feedback
        gitTimeout: isProduction ? 30000 : 10000, // 30s prod, 10s dev

        // Retry configuration - more aggressive in prod
        maxRetries: isProduction ? 3 : 2,
        baseDelayMs: isProduction ? 2000 : 1000,
        maxDelayMs: isProduction ? 10000 : 5000,
    };
}

/**
 * Gets the current environment
 */
export function getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
}

/**
 * Validates that all required environment variables are set
 * @returns Validation result with any missing variables
 */
export function validateEnvironment(): {
    valid: boolean;
    missing: string[];
    warnings: string[];
} {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Required for production
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.SECRET_NAME) {
            missing.push('SECRET_NAME');
        }
        if (!process.env.AWS_REGION) {
            missing.push('AWS_REGION');
        }
    }

    // Optional but recommended
    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
        warnings.push('AWS_LAMBDA_FUNCTION_NAME not set (will use default)');
    }

    return {
        valid: missing.length === 0,
        missing,
        warnings,
    };
}

/**
 * Checks if running in production
 */
export function isProduction(): boolean {
    return getEnvironment() === 'production';
}

/**
 * Gets Lambda-specific environment variables with defaults
 */
export function getLambdaEnv(): {
    secretName: string;
    awsRegion: string;
    functionName: string;
    logLevel: string;
} {
    return {
        secretName: process.env.SECRET_NAME || 'daily-commit-secrets',
        awsRegion: process.env.AWS_REGION || 'us-west-2',
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'daily-commit',
        logLevel: process.env.LOG_LEVEL || getConfig().logLevel,
    };
}
