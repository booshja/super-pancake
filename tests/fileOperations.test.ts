import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';
import { modifyTextFile } from '../src/fileOperations';
import { promises as fs } from 'fs';

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
}));

describe('File Operations Module', () => {
    const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
    const mockWriteFile = fs.writeFile as jest.MockedFunction<
        typeof fs.writeFile
    >;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('modifyTextFile', () => {
        it('should read existing file and write new content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';
            const newContent = 'New content';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, newContent);

            expect(mockReadFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                'utf-8'
            );
            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                newContent,
                'utf-8'
            );
            expect(result).toEqual({
                success: true,
                message: `File /tmp/${filePath} modified successfully`,
                oldContent: existingContent,
                newContent: newContent,
                filePath: `/tmp/${filePath}`,
            });
        });

        it('should handle file not found error', async () => {
            const filePath = 'nonexistent.txt';
            const newContent = 'New content';

            mockReadFile.mockRejectedValue(
                new Error('ENOENT: no such file or directory')
            );
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, newContent);

            expect(mockReadFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                'utf-8'
            );
            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                newContent,
                'utf-8'
            );
            expect(result).toEqual({
                success: true,
                message: `File /tmp/${filePath} modified successfully`,
                oldContent: '',
                newContent: newContent,
                filePath: `/tmp/${filePath}`,
            });
        });

        it('should handle write file errors', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';
            const newContent = 'New content';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockRejectedValue(new Error('Disk full'));

            const result = await modifyTextFile(filePath, newContent);

            expect(result).toEqual({
                success: false,
                message: `Failed to modify file /tmp/${filePath}: Disk full`,
                filePath: `/tmp/${filePath}`,
            });
        });

        it('should handle empty new content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, '');

            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                '',
                'utf-8'
            );
            expect(result.success).toBe(true);
            expect(result.newContent).toBe('');
        });

        it('should handle null new content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, null as any);

            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                null,
                'utf-8'
            );
            expect(result.success).toBe(true);
            expect(result.newContent).toBe(null);
        });

        it('should handle large content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';
            const largeContent = 'x'.repeat(10000); // 10KB content

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, largeContent);

            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                largeContent,
                'utf-8'
            );
            expect(result.success).toBe(true);
            expect(result.newContent).toBe(largeContent);
        });

        it('should handle special characters in content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';
            const specialContent = 'Content with special chars: \n\t\r"\'\\';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, specialContent);

            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                specialContent,
                'utf-8'
            );
            expect(result.success).toBe(true);
            expect(result.newContent).toBe(specialContent);
        });

        it('should handle unicode content', async () => {
            const filePath = 'test.txt';
            const existingContent = 'Old content';
            const unicodeContent = 'Content with unicode: 🚀 中文 العربية';

            mockReadFile.mockResolvedValue(existingContent);
            mockWriteFile.mockResolvedValue();

            const result = await modifyTextFile(filePath, unicodeContent);

            expect(mockWriteFile).toHaveBeenCalledWith(
                `/tmp/${filePath}`,
                unicodeContent,
                'utf-8'
            );
            expect(result.success).toBe(true);
            expect(result.newContent).toBe(unicodeContent);
        });
    });
});
