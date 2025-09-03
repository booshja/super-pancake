import { GitConfig } from './types';

/**
 * GitHub API operations for creating commits without requiring Git binary
 */

export interface GitHubCommitData {
    message: string;
    content: string;
    sha?: string; // Required for updates
}

export interface GitHubFileData {
    path: string;
    mode: '100644' | '100755' | '040000' | '160000' | '120000';
    type: 'blob' | 'tree' | 'commit';
    sha?: string;
    content?: string;
}

/**
 * Creates a commit using GitHub's REST API
 * @param config - Git configuration containing token and repository URL
 * @param filePath - Path to the file to commit
 * @param content - Content of the file
 * @param commitMessage - Commit message
 */
export async function createCommitViaAPI(
    config: GitConfig,
    filePath: string,
    content: string,
    commitMessage: string
): Promise<void> {
    try {
        const { owner, repo } = parseRepositoryUrl(config.repositoryUrl);
        const token = config.token;

        // Get the current commit SHA
        const currentCommit = await getCurrentCommit(token, owner, repo);

        // Get the current tree SHA
        const currentTree = await getCurrentTree(
            token,
            owner,
            repo,
            currentCommit.sha
        );

        // Create or update the file blob
        const fileBlob = await createBlob(token, owner, repo, content);

        // Create new tree with the updated file
        const newTree = await createTree(token, owner, repo, currentTree.sha, [
            {
                path: filePath,
                mode: '100644',
                type: 'blob',
                sha: fileBlob.sha,
            },
        ]);

        // Create the commit
        const commit = await createCommit(
            token,
            owner,
            repo,
            commitMessage,
            newTree.sha,
            currentCommit.sha
        );

        // Update the branch reference
        await updateBranch(token, owner, repo, commit.sha);

        console.log(
            `Successfully created commit via GitHub API: ${commit.sha}`
        );
    } catch (error) {
        console.error('Failed to create commit via GitHub API:', error);
        throw error;
    }
}

/**
 * Parse repository URL to extract owner and repo name
 */
function parseRepositoryUrl(repositoryUrl: string): {
    owner: string;
    repo: string;
} {
    // Handle both https://github.com/owner/repo.git and https://github.com/owner/repo formats
    const match = repositoryUrl.match(
        /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/
    );
    if (!match || !match[1] || !match[2]) {
        throw new Error(`Invalid GitHub repository URL: ${repositoryUrl}`);
    }

    return {
        owner: match[1],
        repo: match[2],
    };
}

/**
 * Get the current commit SHA for the default branch
 */
async function getCurrentCommit(
    token: string,
    owner: string,
    repo: string
): Promise<{ sha: string }> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/HEAD`,
        {
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'daily-commit-lambda',
            },
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to get current commit: ${response.status} ${response.statusText}`
        );
    }

    return await response.json();
}

/**
 * Get the current tree SHA
 */
async function getCurrentTree(
    token: string,
    owner: string,
    repo: string,
    commitSha: string
): Promise<{ sha: string }> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
        {
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'daily-commit-lambda',
            },
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to get current tree: ${response.status} ${response.statusText}`
        );
    }

    const commit = await response.json();
    return { sha: commit.tree.sha };
}

/**
 * Create a blob with file content
 */
async function createBlob(
    token: string,
    owner: string,
    repo: string,
    content: string
): Promise<{ sha: string }> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'daily-commit-lambda',
            },
            body: JSON.stringify({
                content: Buffer.from(content).toString('base64'),
                encoding: 'base64',
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to create blob: ${response.status} ${response.statusText}`
        );
    }

    return await response.json();
}

/**
 * Create a new tree
 */
async function createTree(
    token: string,
    owner: string,
    repo: string,
    baseTreeSha: string,
    tree: GitHubFileData[]
): Promise<{ sha: string }> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees`,
        {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'daily-commit-lambda',
            },
            body: JSON.stringify({
                base_tree: baseTreeSha,
                tree: tree,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to create tree: ${response.status} ${response.statusText}`
        );
    }

    return await response.json();
}

/**
 * Create a commit
 */
async function createCommit(
    token: string,
    owner: string,
    repo: string,
    message: string,
    treeSha: string,
    parentSha: string
): Promise<{ sha: string }> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
        {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'daily-commit-lambda',
            },
            body: JSON.stringify({
                message: message,
                tree: treeSha,
                parents: [parentSha],
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to create commit: ${response.status} ${response.statusText}`
        );
    }

    return await response.json();
}

/**
 * Update the branch reference
 */
async function updateBranch(
    token: string,
    owner: string,
    repo: string,
    commitSha: string
): Promise<void> {
    // First, get the default branch name
    const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'daily-commit-lambda',
            },
        }
    );

    if (!repoResponse.ok) {
        throw new Error(
            `Failed to get repository info: ${repoResponse.status} ${repoResponse.statusText}`
        );
    }

    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;

    // Update the branch reference
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'daily-commit-lambda',
            },
            body: JSON.stringify({
                sha: commitSha,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed to update branch: ${response.status} ${response.statusText}`
        );
    }
}
