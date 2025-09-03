import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { GitConfig } from './types';
import { getConfig } from './config';

// Initialize the Secrets Manager client
let secretsClient = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-west-2',
});

// Export for testing
export { secretsClient };

export interface SecretsConfig {
    gitUserEmail: string;
    gitUserName: string;
    githubToken: string;
    repositoryUrl: string;
}

// Cache for secrets to reduce API calls
interface CachedSecret {
    data: SecretsConfig;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

const secretsCache = new Map<string, CachedSecret>();
const DEFAULT_TTL = getConfig().cacheTTL; // Environment-specific TTL

/**
 * Retrieves secrets from cache or AWS Secrets Manager
 * @param secretName - Name of the secret in AWS Secrets Manager
 * @param ttl - Time to live for cache in milliseconds (default: 5 minutes)
 * @returns Promise<SecretsConfig>
 */
export async function getCachedSecrets(
    secretName: string,
    ttl: number = DEFAULT_TTL
): Promise<SecretsConfig> {
    const now = Date.now();

    // Check cache first
    const cached = secretsCache.get(secretName);
    if (cached && now - cached.timestamp < cached.ttl) {
        console.log(`Using cached secrets for: ${secretName}`);
        return cached.data;
    }

    try {
        console.log(`Retrieving fresh secrets from: ${secretName}`);

        const command = new GetSecretValueCommand({
            SecretId: secretName,
        });

        const response = await secretsClient.send(command);

        if (!response.SecretString) {
            throw new Error('Secret value is empty or not found');
        }

        const secrets = JSON.parse(response.SecretString);

        // Validate required fields
        const requiredFields = [
            'gitUserEmail',
            'gitUserName',
            'githubToken',
            'repositoryUrl',
        ];
        for (const field of requiredFields) {
            if (!secrets[field]) {
                throw new Error(`Missing required secret field: ${field}`);
            }
        }

        const secretsConfig = secrets as SecretsConfig;

        // Cache the secrets
        secretsCache.set(secretName, {
            data: secretsConfig,
            timestamp: now,
            ttl,
        });

        console.log('Secrets retrieved and cached successfully');
        return secretsConfig;
    } catch (error) {
        console.error('Failed to retrieve secrets:', error);
        throw new Error(
            `Failed to retrieve secrets: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Converts SecretsConfig to GitConfig format
 * @param secrets - Secrets from AWS Secrets Manager
 * @returns GitConfig
 */
export function secretsToGitConfig(secrets: SecretsConfig): GitConfig {
    return {
        userEmail: secrets.gitUserEmail,
        userName: secrets.gitUserName,
        token: secrets.githubToken,
        repositoryUrl: secrets.repositoryUrl,
    };
}

/**
 * Retrieves cached secrets and converts to GitConfig
 * @param secretName - Name of the secret in AWS Secrets Manager
 * @param ttl - Cache TTL in milliseconds
 * @returns Promise<GitConfig>
 */
export async function getCachedGitConfig(
    secretName: string,
    ttl: number = DEFAULT_TTL
): Promise<GitConfig> {
    const secrets = await getCachedSecrets(secretName, ttl);
    return secretsToGitConfig(secrets);
}

/**
 * Clears the secrets cache (useful for testing or forced refresh)
 * @param secretName - Optional specific secret name to clear
 */
export function clearSecretsCache(secretName?: string): void {
    if (secretName) {
        secretsCache.delete(secretName);
        console.log(`Cleared cache for secret: ${secretName}`);
    } else {
        secretsCache.clear();
        console.log('Cleared all secrets cache');
    }
}

/**
 * Gets cache statistics
 * @returns Cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
    return {
        size: secretsCache.size,
        entries: Array.from(secretsCache.keys()),
    };
}
