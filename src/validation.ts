import { LambdaEvent } from './types';

/**
 * Validates and sanitizes file paths to prevent directory traversal attacks
 * @param filePath - The file path to validate
 * @returns Sanitized file path
 */
export function validateFilePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('File path is required and must be a string');
    }

    // Remove any directory traversal attempts
    const sanitizedPath = filePath
        .replace(/\.\./g, '') // Remove .. sequences
        .replace(/\/+/g, '/') // Normalize multiple slashes
        .replace(/^\/+/, '') // Remove leading slashes
        .trim();

    if (!sanitizedPath) {
        throw new Error('Invalid file path');
    }

    // Ensure it's a .txt file for security
    if (!sanitizedPath.endsWith('.txt')) {
        throw new Error('Only .txt files are allowed');
    }

    // Check for dangerous characters
    if (/[<>:"|?*\x00-\x1f]/.test(sanitizedPath)) {
        throw new Error('File path contains invalid characters');
    }

    return sanitizedPath;
}

/**
 * Validates and sanitizes commit messages
 * @param commitMessage - The commit message to validate
 * @returns Sanitized commit message
 */
export function validateCommitMessage(commitMessage: string): string {
    if (!commitMessage || typeof commitMessage !== 'string') {
        throw new Error('Commit message is required and must be a string');
    }

    const sanitized = commitMessage.trim();

    if (sanitized.length === 0) {
        throw new Error('Commit message cannot be empty');
    }

    if (sanitized.length > 500) {
        throw new Error('Commit message is too long (max 500 characters)');
    }

    // Check for potentially dangerous content
    if (/<script|javascript:|data:/i.test(sanitized)) {
        throw new Error(
            'Commit message contains potentially dangerous content'
        );
    }

    return sanitized;
}

/**
 * Validates and sanitizes file content
 * @param content - The file content to validate
 * @returns Sanitized content
 */
export function validateFileContent(content: string): string {
    if (typeof content !== 'string') {
        throw new Error('File content must be a string');
    }

    // Limit content size to prevent abuse
    if (content.length > 10000) {
        throw new Error('File content is too large (max 10,000 characters)');
    }

    // Remove null bytes and other control characters (except newlines and tabs)
    const sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
}

/**
 * Validates secret name format
 * @param secretName - The secret name to validate
 * @returns Validated secret name
 */
export function validateSecretName(secretName: string): string {
    if (!secretName || typeof secretName !== 'string') {
        throw new Error('Secret name is required and must be a string');
    }

    const sanitized = secretName.trim();

    if (sanitized.length === 0) {
        throw new Error('Secret name cannot be empty');
    }

    // AWS Secrets Manager naming constraints
    if (!/^[a-zA-Z0-9/_+=.@-]+$/.test(sanitized)) {
        throw new Error('Secret name contains invalid characters');
    }

    if (sanitized.length > 512) {
        throw new Error('Secret name is too long (max 512 characters)');
    }

    return sanitized;
}

/**
 * Validates the complete Lambda event
 * @param event - The Lambda event to validate
 * @returns Validated and sanitized event
 */
export function validateLambdaEvent(event: LambdaEvent): LambdaEvent {
    const validated: LambdaEvent = {};

    // Validate file path
    if (event.filePath) {
        validated.filePath = validateFilePath(event.filePath);
    } else {
        validated.filePath = 'daily-commit.txt'; // Default
    }

    // Validate file content
    if (event.newContent) {
        validated.newContent = validateFileContent(event.newContent);
    } else {
        validated.newContent = `Daily commit - ${new Date().toISOString()}`;
    }

    // Validate commit message
    if (event.commitMessage) {
        validated.commitMessage = validateCommitMessage(event.commitMessage);
    } else {
        validated.commitMessage = `Daily commit - ${new Date().toLocaleDateString()}`;
    }

    // Validate secret name
    if (event.secretName) {
        validated.secretName = validateSecretName(event.secretName);
    } else {
        validated.secretName = 'daily-commit-secrets'; // Default
    }

    return validated;
}

/**
 * Rate limiting check (simple in-memory implementation)
 * In production, consider using DynamoDB or Redis for distributed rate limiting
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
    identifier: string,
    maxRequests: number = 10,
    windowMs: number = 60000
): boolean {
    const now = Date.now();
    const key = identifier;

    const current = rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
        // Reset or initialize
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }

    if (current.count >= maxRequests) {
        return false;
    }

    current.count++;
    return true;
}
