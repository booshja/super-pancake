import { promises as fs } from 'fs';
import { FileModificationResult } from './types';

/**
 * Modifies the content of a text file
 * @param filePath - Path to the file to modify
 * @param newContent - New content to write to the file
 * @returns Promise<FileModificationResult>
 */
export async function modifyTextFile(
    filePath: string,
    newContent: string
): Promise<FileModificationResult> {
    try {
        // Ensure file path is in /tmp directory for Lambda compatibility
        const lambdaFilePath = filePath.startsWith('/tmp/')
            ? filePath
            : `/tmp/${filePath}`;

        // Read existing content if file exists, otherwise use template
        let oldContent = '';
        try {
            oldContent = await fs.readFile(lambdaFilePath, 'utf-8');
        } catch (error) {
            // File doesn't exist, try to copy from template
            try {
                const templatePath = '/var/task/daily-commit-template.txt';
                oldContent = await fs.readFile(templatePath, 'utf-8');
                console.log(`Using template file: ${templatePath}`);
            } catch (templateError) {
                // No template file, start with empty content
                console.log(
                    `File ${lambdaFilePath} doesn't exist and no template found, will create it`
                );
                oldContent = '';
            }
        }

        // Write new content to file
        await fs.writeFile(lambdaFilePath, newContent, 'utf-8');

        console.log(`Successfully modified file: ${lambdaFilePath}`);

        return {
            success: true,
            message: `File ${lambdaFilePath} modified successfully`,
            filePath: lambdaFilePath,
            oldContent,
            newContent,
        };
    } catch (error) {
        const lambdaFilePath = filePath.startsWith('/tmp/')
            ? filePath
            : `/tmp/${filePath}`;
        const errorMessage = `Failed to modify file ${lambdaFilePath}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`;
        console.error(errorMessage);

        return {
            success: false,
            message: errorMessage,
            filePath: lambdaFilePath,
        };
    }
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param dirPath - Path to the directory
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
}
