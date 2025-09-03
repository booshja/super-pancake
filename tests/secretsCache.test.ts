import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';

// Mock config module first
jest.mock('../src/config', () => ({
    getConfig: () => ({
        cacheTTL: 300000, // 5 minutes
    }),
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn(),
    GetSecretValueCommand: jest.fn(),
}));

import {
    getCachedSecrets,
    secretsToGitConfig,
    getCachedGitConfig,
    clearSecretsCache,
    getCacheStats,
    secretsClient,
} from '../src/secretsCache';
import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

describe('Secrets Cache Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearSecretsCache(); // Clear cache before each test

        // Mock the imported secretsClient instance
        (secretsClient as any).send = jest.fn() as jest.MockedFunction<any>;
    });

    afterEach(() => {
        clearSecretsCache();
    });

    describe('getCachedSecrets', () => {
        it('should retrieve secrets from AWS Secrets Manager on first call', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: JSON.stringify(mockSecrets),
            });

            const result = await getCachedSecrets('test-secret');

            expect(secretsClient.send).toHaveBeenCalledTimes(1);
            expect(secretsClient.send).toHaveBeenCalledWith(
                expect.any(GetSecretValueCommand)
            );
            expect(result).toEqual(mockSecrets);
        });

        it('should return cached secrets on subsequent calls', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: JSON.stringify(mockSecrets),
            });

            // First call
            await getCachedSecrets('test-secret');

            // Second call should use cache
            const result = await getCachedSecrets('test-secret');

            expect(secretsClient.send).toHaveBeenCalledTimes(1);
            expect(result).toEqual(mockSecrets);
        });

        it('should throw error for missing secret fields', async () => {
            const incompleteSecrets = {
                gitUserEmail: 'test@example.com',
                // Missing other required fields
            };

            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: JSON.stringify(incompleteSecrets),
            });

            await expect(getCachedSecrets('test-secret')).rejects.toThrow(
                'Missing required secret field'
            );
        });

        it('should throw error for empty secret string', async () => {
            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: null,
            });

            await expect(getCachedSecrets('test-secret')).rejects.toThrow(
                'Secret value is empty or not found'
            );
        });

        it('should throw error for invalid JSON', async () => {
            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: 'invalid-json',
            });

            await expect(getCachedSecrets('test-secret')).rejects.toThrow();
        });

        it('should handle AWS SDK errors', async () => {
            (secretsClient.send as any).mockRejectedValueOnce(
                new Error('AWS SDK error')
            );

            await expect(getCachedSecrets('test-secret')).rejects.toThrow(
                'Failed to retrieve secrets'
            );
        });
    });

    describe('secretsToGitConfig', () => {
        it('should convert secrets to git config format', () => {
            const secrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            const result = secretsToGitConfig(secrets);

            expect(result).toEqual({
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            });
        });
    });

    describe('getCachedGitConfig', () => {
        it('should retrieve and convert secrets to git config', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValueOnce({
                SecretString: JSON.stringify(mockSecrets),
            });

            const result = await getCachedGitConfig('test-secret');

            expect(result).toEqual({
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            });
        });
    });

    describe('clearSecretsCache', () => {
        it('should clear all cache when no secret name provided', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValue({
                SecretString: JSON.stringify(mockSecrets),
            });

            // Populate cache
            await getCachedSecrets('secret1');
            await getCachedSecrets('secret2');

            expect(getCacheStats().size).toBe(2);

            clearSecretsCache();

            expect(getCacheStats().size).toBe(0);
        });

        it('should clear specific secret from cache', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValue({
                SecretString: JSON.stringify(mockSecrets),
            });

            // Populate cache
            await getCachedSecrets('secret1');
            await getCachedSecrets('secret2');

            expect(getCacheStats().size).toBe(2);

            clearSecretsCache('secret1');

            expect(getCacheStats().size).toBe(1);
            expect(getCacheStats().entries).not.toContain('secret1');
            expect(getCacheStats().entries).toContain('secret2');
        });
    });

    describe('getCacheStats', () => {
        it('should return empty stats for empty cache', () => {
            const stats = getCacheStats();

            expect(stats.size).toBe(0);
            expect(stats.entries).toEqual([]);
        });

        it('should return correct stats for populated cache', async () => {
            const mockSecrets = {
                gitUserEmail: 'test@example.com',
                gitUserName: 'Test User',
                githubToken: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            (secretsClient.send as any).mockResolvedValue({
                SecretString: JSON.stringify(mockSecrets),
            });

            await getCachedSecrets('secret1');
            await getCachedSecrets('secret2');

            const stats = getCacheStats();

            expect(stats.size).toBe(2);
            expect(stats.entries).toContain('secret1');
            expect(stats.entries).toContain('secret2');
        });
    });
});
