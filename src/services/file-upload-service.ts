import fs from 'fs/promises';
import path from 'path';
import { ProcessedDocument } from '../models/types';
import { neo4jManager } from '../database/neo4j';
import DocumentProcessor from './document-processor';
import GraphService from './graph-service';

export class FileUploadService {
  private documentProcessor: DocumentProcessor;
  private graphService: GraphService;
  private uploadDir: string;

  constructor() {
    this.documentProcessor = DocumentProcessor.getInstance();
    this.graphService = new GraphService();
    this.uploadDir = './uploads';
  }

  /**
   * Process uploaded files
   */
  async processUploadedFiles(files: Express.Multer.File[]): Promise<{
    success: boolean;
    message: string;
    processedCount: number;
    totalCount: number;
  }> {
    try {
      // Ensure upload directory exists
      await this.ensureUploadDirectory();

      // Save uploaded files
      const savedFiles = await this.saveUploadedFiles(files);
      
      if (savedFiles.length === 0) {
        return {
          success: false,
          message: 'No valid files uploaded',
          processedCount: 0,
          totalCount: files.length,
        };
      }

      // Process documents
      console.log(`📄 Starting to process ${savedFiles.length} uploaded files...`);
      const documents = await this.documentProcessor.processFiles(savedFiles);
      
      if (documents.length === 0) {
        return {
          success: false,
          message: 'File processing failed, no valid documents generated',
          processedCount: 0,
          totalCount: savedFiles.length,
        };
      }

      // Write to graph database
      console.log(`💾 Starting database write...`);
      await this.graphService.processAndWriteGraphDocuments(documents);
      
      // Clean up temporary files
      await this.cleanupTempFiles(savedFiles);

      return {
        success: true,
        message: `Successfully processed ${documents.length} documents`,
        processedCount: documents.length,
        totalCount: savedFiles.length,
      };

    } catch (error) {
      console.error('❌ Failed to process uploaded files:', error);
      
      // Clean up temporary files
      try {
        await this.cleanupTempFiles(files.map(f => f.path));
      } catch (cleanupError) {
        console.error('Failed to cleanup temporary files:', cleanupError);
      }

      return {
        success: false,
        message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processedCount: 0,
        totalCount: files.length,
      };
    }
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Save uploaded files
   */
  private async saveUploadedFiles(files: Express.Multer.File[]): Promise<string[]> {
    const savedFiles: string[] = [];

    for (const file of files) {
      try {
        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const extension = path.extname(file.originalname);
        const filename = `${timestamp}_${randomSuffix}${extension}`;
        const filePath = path.join(this.uploadDir, filename);

        // Save file
        await fs.writeFile(filePath, file.buffer);
        savedFiles.push(filePath);

        console.log(`✅ File saved: ${file.originalname} -> ${filePath}`);
      } catch (error) {
        console.error(`❌ Failed to save file: ${file.originalname}`, error);
      }
    }

    return savedFiles;
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`🧹 Temporary file cleaned: ${filePath}`);
      } catch (error) {
        console.error(`❌ Failed to cleanup file: ${filePath}`, error);
      }
    }
  }

  /**
   * Get file list from upload directory
   */
  async getUploadedFiles(): Promise<Array<{
    filename: string;
    size: number;
    uploadTime: Date;
    path: string;
  }>> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const fileInfos = [];

      for (const filename of files) {
        const filePath = path.join(this.uploadDir, filename);
        const stats = await fs.stat(filePath);
        
        fileInfos.push({
          filename,
          size: stats.size,
          uploadTime: stats.mtime,
          path: filePath,
        });
      }

      return fileInfos.sort((a, b) => b.uploadTime.getTime() - a.uploadTime.getTime());
    } catch (error) {
      console.error('Failed to get uploaded file list:', error);
      return [];
    }
  }

  /**
   * Delete specified uploaded file
   */
  async deleteUploadedFile(filename: string): Promise<boolean> {
    try {
      const filePath = path.join(this.uploadDir, filename);
      await fs.unlink(filePath);
      console.log(`🗑️ File deleted: ${filename}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete file: ${filename}`, error);
      return false;
    }
  }

  /**
   * Clear all uploaded files
   */
  async clearAllUploadedFiles(): Promise<boolean> {
    try {
      const files = await fs.readdir(this.uploadDir);
      
      for (const filename of files) {
        const filePath = path.join(this.uploadDir, filename);
        await fs.unlink(filePath);
      }

      console.log(`🧹 Cleared ${files.length} uploaded files`);
      return true;
    } catch (error) {
      console.error('Failed to clear uploaded files:', error);
      return false;
    }
  }
}

export default FileUploadService; 