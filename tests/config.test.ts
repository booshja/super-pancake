import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    getConfig,
    getEnvironment,
    isProduction,
    getLambdaEnv,
    validateEnvironment,
} from '../src/config';

describe('Configuration Module', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('getConfig', () => {
        it('should return development config by default', () => {
            delete process.env.NODE_ENV;
            const config = getConfig();

            expect(config.cacheTTL).toBe(60000); // 1 minute
            expect(config.metricsBatchSize).toBe(1);
            expect(config.logLevel).toBe('INFO');
            expect(config.gitTimeout).toBe(10000);
            expect(config.maxRetries).toBe(2);
            expect(config.baseDelayMs).toBe(1000);
            expect(config.maxDelayMs).toBe(5000);
        });

        it('should return production config when NODE_ENV is production', () => {
            process.env.NODE_ENV = 'production';
            const config = getConfig();

            expect(config.cacheTTL).toBe(300000); // 5 minutes
            expect(config.metricsBatchSize).toBe(10);
            expect(config.logLevel).toBe('ERROR');
            expect(config.gitTimeout).toBe(30000);
            expect(config.maxRetries).toBe(3);
            expect(config.baseDelayMs).toBe(2000);
            expect(config.maxDelayMs).toBe(10000);
        });

        it('should handle invalid NODE_ENV gracefully', () => {
            process.env.NODE_ENV = 'invalid';
            const config = getConfig();

            // Should default to development config
            expect(config.logLevel).toBe('INFO');
        });
    });

    describe('getEnvironment', () => {
        it('should return development by default', () => {
            delete process.env.NODE_ENV;
            expect(getEnvironment()).toBe('development');
        });

        it('should return production when NODE_ENV is production', () => {
            process.env.NODE_ENV = 'production';
            expect(getEnvironment()).toBe('production');
        });

        it('should return custom environment', () => {
            process.env.NODE_ENV = 'staging';
            expect(getEnvironment()).toBe('staging');
        });
    });

    describe('isProduction', () => {
        it('should return false by default', () => {
            delete process.env.NODE_ENV;
            expect(isProduction()).toBe(false);
        });

        it('should return true when NODE_ENV is production', () => {
            process.env.NODE_ENV = 'production';
            expect(isProduction()).toBe(true);
        });

        it('should return false for other environments', () => {
            process.env.NODE_ENV = 'staging';
            expect(isProduction()).toBe(false);
        });
    });

    describe('getLambdaEnv', () => {
        it('should return default values when environment variables are not set', () => {
            delete process.env.SECRET_NAME;
            delete process.env.AWS_REGION;
            delete process.env.AWS_LAMBDA_FUNCTION_NAME;
            delete process.env.LOG_LEVEL;

            const env = getLambdaEnv();

            expect(env.secretName).toBe('daily-commit-secrets');
            expect(env.awsRegion).toBe('us-west-2');
            expect(env.functionName).toBe('daily-commit');
            expect(env.logLevel).toBe('INFO'); // Default from getConfig()
        });

        it('should return environment variables when set', () => {
            process.env.SECRET_NAME = 'custom-secret';
            process.env.AWS_REGION = 'us-east-1';
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'custom-function';
            process.env.LOG_LEVEL = 'WARN';

            const env = getLambdaEnv();

            expect(env.secretName).toBe('custom-secret');
            expect(env.awsRegion).toBe('us-east-1');
            expect(env.functionName).toBe('custom-function');
            expect(env.logLevel).toBe('WARN');
        });

        it('should handle mixed environment variables', () => {
            process.env.SECRET_NAME = 'custom-secret';
            // AWS_REGION not set
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'custom-function';
            // LOG_LEVEL not set

            const env = getLambdaEnv();

            expect(env.secretName).toBe('custom-secret');
            expect(env.awsRegion).toBe('us-west-2'); // Default
            expect(env.functionName).toBe('custom-function');
            expect(env.logLevel).toBe('INFO'); // Default from getConfig()
        });
    });

    describe('validateEnvironment', () => {
        it('should pass validation in development mode', () => {
            delete process.env.NODE_ENV;
            delete process.env.AWS_LAMBDA_FUNCTION_NAME;
            const result = validateEnvironment();

            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
            expect(result.warnings).toContain(
                'AWS_LAMBDA_FUNCTION_NAME not set (will use default)'
            );
        });

        it('should require SECRET_NAME and AWS_REGION in production', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.SECRET_NAME;
            delete process.env.AWS_REGION;
            delete process.env.AWS_LAMBDA_FUNCTION_NAME;

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('SECRET_NAME');
            expect(result.missing).toContain('AWS_REGION');
            expect(result.warnings).toContain(
                'AWS_LAMBDA_FUNCTION_NAME not set (will use default)'
            );
        });

        it('should pass validation in production with all required variables', () => {
            process.env.NODE_ENV = 'production';
            process.env.SECRET_NAME = 'test-secret';
            process.env.AWS_REGION = 'us-west-2';
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';

            const result = validateEnvironment();

            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
            expect(result.warnings).toEqual([]);
        });

        it('should handle partial configuration in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.SECRET_NAME = 'test-secret';
            delete process.env.AWS_REGION; // Missing AWS_REGION
            delete process.env.AWS_LAMBDA_FUNCTION_NAME;

            const result = validateEnvironment();

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('AWS_REGION');
            expect(result.missing).not.toContain('SECRET_NAME');
            expect(result.warnings).toContain(
                'AWS_LAMBDA_FUNCTION_NAME not set (will use default)'
            );
        });
    });
});
