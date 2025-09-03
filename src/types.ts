export interface LambdaEvent {
    filePath?: string;
    newContent?: string;
    commitMessage?: string;
    gitUserEmail?: string;
    gitUserName?: string;
    githubToken?: string;
    repositoryUrl?: string;
    secretName?: string;
}

export interface EventBridgeEvent {
    version: string;
    id: string;
    'detail-type': string;
    source: string;
    account: string;
    time: string;
    region: string;
    resources: string[];
    detail: Record<string, any>;
}

export interface LambdaResponse {
    statusCode: number;
    body: string;
    headers?: Record<string, string>;
}

export interface GitConfig {
    userEmail: string;
    userName: string;
    token: string;
    repositoryUrl: string;
}

export interface FileModificationResult {
    success: boolean;
    message: string;
    filePath?: string;
    oldContent?: string;
    newContent?: string;
}
