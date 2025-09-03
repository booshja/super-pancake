import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';

// Mock the exec function before importing anything else
const mockExec = jest.fn() as jest.MockedFunction<any>;

jest.mock('child_process', () => ({
    exec: jest.fn(),
}));

jest.mock('util', () => ({
    promisify: jest.fn().mockReturnValue(mockExec),
}));

import {
    executeGitCommand,
    configureGit,
    initializeRepository,
    addFileToGit,
    commitChanges,
    pushToRemote,
} from '../src/gitNative';
import { GitConfig } from '../src/types';

describe('Git Native Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockClear();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('executeGitCommand', () => {
        it('should execute git command successfully', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: 'success output',
                stderr: '',
            });

            const result = await executeGitCommand('git status');

            expect(mockExec).toHaveBeenCalledWith('git status', {
                cwd: '/tmp',
                timeout: expect.any(Number),
                maxBuffer: 1024 * 1024,
            });
            expect(result).toBe('success output');
        });

        it('should handle git warnings in stderr', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: 'success output',
                stderr: 'warning: some warning message',
            });

            const result = await executeGitCommand('git status');

            expect(result).toBe('success output');
        });

        it('should throw error for non-warning stderr', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: '',
                stderr: 'fatal: not a git repository',
            });

            await expect(executeGitCommand('git status')).rejects.toThrow(
                'Git command failed: fatal: not a git repository'
            );
        });

        it('should throw error for exec failure', async () => {
            mockExec.mockRejectedValueOnce(new Error('Command failed'));

            await expect(executeGitCommand('git status')).rejects.toThrow(
                "Git command 'git status' failed: Command failed"
            );
        });

        it('should use custom working directory', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: 'success',
                stderr: '',
            });

            await executeGitCommand('git status', '/custom/path');

            expect(mockExec).toHaveBeenCalledWith('git status', {
                cwd: '/custom/path',
                timeout: expect.any(Number),
                maxBuffer: 1024 * 1024,
            });
        });
    });

    describe('configureGit', () => {
        it('should configure git user successfully', async () => {
            mockExec.mockResolvedValue({ stdout: '', stderr: '' });

            const config: GitConfig = {
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            await configureGit(config);

            expect(mockExec).toHaveBeenCalledWith(
                'git config user.email "test@example.com"',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git config user.name "Test User"',
                expect.any(Object)
            );
        });

        it('should handle git config errors', async () => {
            mockExec.mockRejectedValueOnce(new Error('Git config failed'));

            const config: GitConfig = {
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            await expect(configureGit(config)).rejects.toThrow(
                'Git config failed'
            );
        });
    });

    describe('initializeRepository', () => {
        it('should initialize new repository when none exists', async () => {
            // Mock the sequence: git rev-parse fails, git clone succeeds,
            // git remote get-url succeeds
            mockExec
                .mockRejectedValueOnce(new Error('Not a git repository'))
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({
                    stdout: 'https://github.com/test/repo.git',
                    stderr: '',
                });

            await initializeRepository('https://github.com/test/repo.git');

            expect(mockExec).toHaveBeenCalledWith(
                'git rev-parse --git-dir',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git clone "https://github.com/test/repo.git" .',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git remote get-url origin',
                expect.any(Object)
            );
        });

        it('should add remote when repository exists but no remote', async () => {
            // First call succeeds (git repo exists), git pull succeeds, second fails (no remote), third succeeds (add remote)
            mockExec
                .mockResolvedValueOnce({ stdout: '.git', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockRejectedValueOnce(new Error('No remote'))
                .mockResolvedValueOnce({ stdout: '', stderr: '' });

            await initializeRepository('https://github.com/test/repo.git');

            expect(mockExec).toHaveBeenCalledWith(
                'git rev-parse --git-dir',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git pull origin',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git remote get-url origin',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git remote add origin "https://github.com/test/repo.git"',
                expect.any(Object)
            );
        });

        it('should do nothing when repository and remote exist', async () => {
            mockExec
                .mockResolvedValueOnce({ stdout: '.git', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({
                    stdout: 'https://github.com/test/repo.git',
                    stderr: '',
                });

            await initializeRepository('https://github.com/test/repo.git');

            expect(mockExec).toHaveBeenCalledWith(
                'git rev-parse --git-dir',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git pull origin',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git remote get-url origin',
                expect.any(Object)
            );
            expect(mockExec).not.toHaveBeenCalledWith(
                'git clone',
                expect.any(Object)
            );
            expect(mockExec).not.toHaveBeenCalledWith(
                'git remote add origin',
                expect.any(Object)
            );
        });
    });

    describe('addFileToGit', () => {
        it('should add file to git staging area', async () => {
            mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await addFileToGit('test.txt');

            expect(mockExec).toHaveBeenCalledWith(
                'git add "test.txt"',
                expect.any(Object)
            );
        });

        it('should handle git add errors', async () => {
            mockExec.mockRejectedValueOnce(new Error('File not found'));

            await expect(addFileToGit('nonexistent.txt')).rejects.toThrow(
                'File not found'
            );
        });
    });

    describe('commitChanges', () => {
        it('should commit changes with message', async () => {
            mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await commitChanges('Test commit message');

            expect(mockExec).toHaveBeenCalledWith(
                'git commit -m "Test commit message"',
                expect.any(Object)
            );
        });

        it('should escape quotes in commit message', async () => {
            mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

            await commitChanges('Test "quoted" message');

            expect(mockExec).toHaveBeenCalledWith(
                'git commit -m "Test \\"quoted\\" message"',
                expect.any(Object)
            );
        });

        it('should handle git commit errors', async () => {
            mockExec.mockRejectedValueOnce(new Error('Nothing to commit'));

            await expect(commitChanges('Test commit')).rejects.toThrow(
                'Nothing to commit'
            );
        });
    });

    describe('pushToRemote', () => {
        it('should push to remote repository', async () => {
            mockExec
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote set-url
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // branch detection
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // push

            const config: GitConfig = {
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            await pushToRemote(config);

            expect(mockExec).toHaveBeenCalledWith(
                'git remote set-url origin "https://ghp_test123@github.com/test/repo.git"',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git branch --show-current',
                expect.any(Object)
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git push origin main',
                expect.any(Object)
            );
        });

        it('should handle git push errors', async () => {
            mockExec
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote set-url
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // branch detection
                .mockRejectedValueOnce(new Error('Push failed')); // push

            const config: GitConfig = {
                userEmail: 'test@example.com',
                userName: 'Test User',
                token: 'ghp_test123',
                repositoryUrl: 'https://github.com/test/repo.git',
            };

            await expect(pushToRemote(config)).rejects.toThrow('Push failed');
        });
    });
});
