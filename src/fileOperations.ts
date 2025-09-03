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
        // Read existing content if file exists
        let oldContent = '';
        try {
            oldContent = await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            // File doesn't exist, which is fine - we'll create it
            console.log(`File ${filePath} doesn't exist, will create it`);
        }

        // Write new content to file
        await fs.writeFile(filePath, newContent, 'utf-8');

        console.log(`Successfully modified file: ${filePath}`);

        return {
            success: true,
            message: `File ${filePath} modified successfully`,
            filePath,
            oldContent,
            newContent,
        };
    } catch (error) {
        const errorMessage = `Failed to modify file ${filePath}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`;
        console.error(errorMessage);

        return {
            success: false,
            message: errorMessage,
            filePath,
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
