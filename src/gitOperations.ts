import { GitConfig } from './types';
import { withRetry, RETRY_CONFIGS } from './retry';
import {
    configureGit,
    initializeRepository,
    addFileToGit,
    commitChanges,
    pushToRemote,
} from './gitNative';

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
    return withRetry(
        async () => {
            await configureGit(config);
            await initializeRepository(config.repositoryUrl);
            await addFileToGit(filePath);
            await commitChanges(commitMessage);
            await pushToRemote(config);

            // Note: Using console.log here as this is a legacy compatibility layer
            console.log('Git workflow completed successfully');
        },
        RETRY_CONFIGS.git,
        'Git workflow'
    );
}
