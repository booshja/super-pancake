import {
    validateFilePath,
    validateCommitMessage,
    validateFileContent,
    validateSecretName,
    validateLambdaEvent,
    checkRateLimit,
} from '../src/validation';

describe('Validation Functions', () => {
    describe('validateFilePath', () => {
        it('should accept valid file paths', () => {
            expect(validateFilePath('daily-commit.txt')).toBe(
                'daily-commit.txt'
            );
            expect(validateFilePath('folder/file.txt')).toBe('folder/file.txt');
        });

        it('should reject directory traversal attempts', () => {
            expect(() => validateFilePath('../../../etc/passwd')).toThrow();
            expect(() =>
                validateFilePath('..\\..\\windows\\system32')
            ).toThrow();
        });

        it('should reject non-txt files', () => {
            expect(() => validateFilePath('script.js')).toThrow();
            expect(() => validateFilePath('config.json')).toThrow();
        });

        it('should reject dangerous characters', () => {
            expect(() => validateFilePath('file<>.txt')).toThrow();
            expect(() => validateFilePath('file|.txt')).toThrow();
        });
    });

    describe('validateCommitMessage', () => {
        it('should accept valid commit messages', () => {
            expect(validateCommitMessage('Daily commit')).toBe('Daily commit');
            expect(validateCommitMessage('Update file with new data')).toBe(
                'Update file with new data'
            );
        });

        it('should reject empty messages', () => {
            expect(() => validateCommitMessage('')).toThrow();
            expect(() => validateCommitMessage('   ')).toThrow();
        });

        it('should reject messages that are too long', () => {
            const longMessage = 'a'.repeat(501);
            expect(() => validateCommitMessage(longMessage)).toThrow();
        });

        it('should reject dangerous content', () => {
            expect(() =>
                validateCommitMessage('<script>alert("xss")</script>')
            ).toThrow();
            expect(() =>
                validateCommitMessage('javascript:alert("xss")')
            ).toThrow();
        });
    });

    describe('validateFileContent', () => {
        it('should accept valid content', () => {
            expect(validateFileContent('Hello, world!')).toBe('Hello, world!');
            expect(validateFileContent('Daily commit - 2024-01-15')).toBe(
                'Daily commit - 2024-01-15'
            );
        });

        it('should reject content that is too large', () => {
            const largeContent = 'a'.repeat(10001);
            expect(() => validateFileContent(largeContent)).toThrow();
        });

        it('should remove control characters', () => {
            const contentWithControlChars = 'Hello\x00World\x1F';
            expect(validateFileContent(contentWithControlChars)).toBe(
                'HelloWorld'
            );
        });
    });

    describe('validateSecretName', () => {
        it('should accept valid secret names', () => {
            expect(validateSecretName('daily-commit-secrets')).toBe(
                'daily-commit-secrets'
            );
            expect(validateSecretName('prod/git/credentials')).toBe(
                'prod/git/credentials'
            );
        });

        it('should reject invalid characters', () => {
            expect(() => validateSecretName('secret with spaces')).toThrow();
            expect(() => validateSecretName('secret@#$%')).toThrow();
        });

        it('should reject names that are too long', () => {
            const longName = 'a'.repeat(513);
            expect(() => validateSecretName(longName)).toThrow();
        });
    });

    describe('validateLambdaEvent', () => {
        it('should validate and sanitize a complete event', () => {
            const event = {
                filePath: 'test.txt',
                newContent: 'Test content',
                commitMessage: 'Test commit',
                secretName: 'test-secret',
            };

            const result = validateLambdaEvent(event);
            expect(result.filePath).toBe('test.txt');
            expect(result.newContent).toBe('Test content');
            expect(result.commitMessage).toBe('Test commit');
            expect(result.secretName).toBe('test-secret');
        });

        it('should use defaults for missing fields', () => {
            const event = {};
            const result = validateLambdaEvent(event);

            expect(result.filePath).toBe('daily-commit.txt');
            expect(result.newContent).toContain('Daily commit');
            expect(result.commitMessage).toContain('Daily commit');
            expect(result.secretName).toBe('daily-commit-secrets');
        });
    });

    describe('checkRateLimit', () => {
        it('should allow requests within limit', () => {
            expect(checkRateLimit('test-client', 5, 1000)).toBe(true);
            expect(checkRateLimit('test-client', 5, 1000)).toBe(true);
        });

        it('should block requests over limit', () => {
            const clientId = 'test-client-2';
            // Make 5 requests (limit)
            for (let i = 0; i < 5; i++) {
                expect(checkRateLimit(clientId, 5, 1000)).toBe(true);
            }
            // 6th request should be blocked
            expect(checkRateLimit(clientId, 5, 1000)).toBe(false);
        });
    });
});
