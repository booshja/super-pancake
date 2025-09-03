import { exec } from 'child_process';
import { promisify } from 'util';
import { GitConfig } from './types';
import { getConfig } from './config';

const execAsync = promisify(exec);

/**
 * Executes a git command with proper error handling
 * @param command - Git command to execute
 * @param cwd - Working directory
 * @returns Promise with command output
 */
export async function executeGitCommand(
    command: string,
    cwd: string = '/tmp'
): Promise<string> {
    try {
        const config = getConfig();
        const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout: config.gitTimeout, // Environment-specific timeout
            maxBuffer: 1024 * 1024, // 1MB buffer
        });

        if (stderr && !stderr.includes('warning:')) {
            throw new Error(`Git command failed: ${stderr}`);
        }

        return stdout.trim();
    } catch (error) {
        throw new Error(
            `Git command '${command}' failed: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Configures git with user credentials
 * @param config - Git configuration
 */
export async function configureGit(config: GitConfig): Promise<void> {
    try {
        await executeGitCommand(`git config user.email "${config.userEmail}"`);
        await executeGitCommand(`git config user.name "${config.userName}"`);
        console.log('Git user configuration set successfully');
    } catch (error) {
        console.error('Failed to configure git user:', error);
        throw error;
    }
}

/**
 * Initializes a git repository by cloning or updating existing
 * @param repositoryUrl - Remote repository URL
 */
export async function initializeRepository(
    repositoryUrl: string
): Promise<void> {
    try {
        // Check if this is already a git repository
        try {
            await executeGitCommand('git rev-parse --git-dir');
            console.log('Git repository already exists, updating...');

            // Pull latest changes
            await executeGitCommand('git pull origin');
            console.log('Repository updated with latest changes');
        } catch {
            console.log('Cloning repository...');
            // Clone the repository instead of initializing empty one
            await executeGitCommand(`git clone "${repositoryUrl}" .`);
            console.log('Repository cloned successfully');
        }

        // Ensure remote origin is set correctly
        try {
            const currentUrl = await executeGitCommand(
                'git remote get-url origin'
            );
            if (currentUrl.trim() !== repositoryUrl) {
                await executeGitCommand(
                    `git remote set-url origin "${repositoryUrl}"`
                );
                console.log('Remote origin URL updated');
            }
        } catch {
            await executeGitCommand(`git remote add origin "${repositoryUrl}"`);
            console.log('Remote origin added');
        }
    } catch (error) {
        console.error('Failed to initialize repository:', error);
        throw error;
    }
}

/**
 * Adds a file to git staging area
 * @param filePath - Path to the file to add
 */
export async function addFileToGit(filePath: string): Promise<void> {
    try {
        await executeGitCommand(`git add "${filePath}"`);
        console.log(`File ${filePath} added to git staging area`);
    } catch (error) {
        console.error(`Failed to add file ${filePath} to git:`, error);
        throw error;
    }
}

/**
 * Commits changes with a message
 * @param commitMessage - Commit message
 */
export async function commitChanges(commitMessage: string): Promise<void> {
    try {
        await executeGitCommand(
            `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`
        );
        console.log(`Changes committed with message: ${commitMessage}`);
    } catch (error) {
        console.error('Failed to commit changes:', error);
        throw error;
    }
}

/**
 * Pushes changes to the remote repository
 * @param config - Git configuration containing token and repository URL
 */
export async function pushToRemote(config: GitConfig): Promise<void> {
    try {
        // Set up authentication using the token
        const remoteUrl = config.repositoryUrl.replace(
            'https://',
            `https://${config.token}@`
        );

        // Update remote URL with token
        await executeGitCommand(`git remote set-url origin "${remoteUrl}"`);

        // Get current branch name
        let currentBranch: string;
        try {
            currentBranch = await executeGitCommand(
                'git branch --show-current'
            );
            currentBranch = currentBranch.trim();
        } catch {
            // Fallback to main if branch detection fails
            currentBranch = 'main';
        }

        // Push to remote repository with current branch
        await executeGitCommand(`git push origin ${currentBranch}`);
        console.log(
            `Changes pushed to remote repository successfully on branch: ${currentBranch}`
        );
    } catch (error) {
        console.error('Failed to push to remote repository:', error);
        throw error;
    }
}

/**
 * Performs complete git workflow: add, commit, and push
 * @param filePath - Path to the file to commit
 * @param commitMessage - Commit message
 * @param config - Git configuration
 */
export async function performGitWorkflow(
    filePath: string,
    commitMessage: string,
    config: GitConfig
): Promise<void> {
    try {
        // Configure git user
        await configureGit(config);

        // Initialize repository if needed
        await initializeRepository(config.repositoryUrl);

        // Add file to staging
        await addFileToGit(filePath);

        // Commit changes
        await commitChanges(commitMessage);

        // Push to remote
        await pushToRemote(config);

        console.log('Git workflow completed successfully');
    } catch (error) {
        console.error('Git workflow failed:', error);
        throw error;
    }
}
