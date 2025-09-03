// Test setup file
import { jest } from '@jest/globals';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
    GetSecretValueCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cloudwatch', () => ({
    CloudWatchClient: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
    PutMetricDataCommand: jest.fn(),
}));

// Mock child_process exec for native git commands
jest.mock('child_process', () => ({
    exec: jest.fn(
        (
            command: string,
            options: any,
            callback?: (error: any, stdout: string, stderr: string) => void
        ) => {
            // Mock successful git commands
            if (callback) {
                callback(null, '', '');
            }
            return { stdout: '', stderr: '' };
        }
    ),
}));

// Mock util.promisify to work with our exec mock
jest.mock('util', () => ({
    promisify: jest.fn((fn: any) => {
        return jest
            .fn()
            .mockImplementation(() =>
                Promise.resolve({ stdout: '', stderr: '' })
            );
    }),
}));

// Set up environment variables for tests
process.env.SECRET_NAME = 'test-secret';
process.env.AWS_REGION = 'us-west-2';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
