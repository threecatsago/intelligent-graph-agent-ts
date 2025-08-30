import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/settings';
import { ProcessedDocument, ChunkNode } from '../models/types';

export class DocumentProcessor {
  private chunkSize: number;
  private overlap: number;
  private maxFileSize: number;

  constructor() {
    this.chunkSize = config.document.chunkSize;
    this.overlap = config.document.overlap;
    this.maxFileSize = config.document.maxFileSize;
  }

  /**
   * Process all documents in specified directory
   */
  async processDirectory(dirPath: string): Promise<ProcessedDocument[]> {
    try {
      const files = await this.getSupportedFiles(dirPath);
      const documents: ProcessedDocument[] = [];

      for (const file of files) {
        try {
          const document = await this.processFile(file);
          if (document) {
            documents.push(document);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process file: ${file}`, error);
        }
      }

      console.log(`✅ Successfully processed ${documents.length} documents`);
      return documents;
    } catch (error) {
      console.error('❌ Failed to process directory:', error);
      throw error;
    }
  }

  /**
   * Process specified file list
   */
  async processFiles(filePaths: string[]): Promise<ProcessedDocument[]> {
    try {
      const documents: ProcessedDocument[] = [];

      for (const filePath of filePaths) {
        try {
          const document = await this.processFile(filePath);
          if (document) {
            documents.push(document);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process file: ${filePath}`, error);
        }
      }

      console.log(`✅ Successfully processed ${documents.length} files`);
      return documents;
    } catch (error) {
      console.error('❌ Failed to process file list:', error);
      throw error;
    }
  }

  /**
   * Process single file
   */
  async processFile(filePath: string): Promise<ProcessedDocument | null> {
    try {
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        console.warn(`⚠️ File too large, skipping: ${filePath} (${stats.size} bytes)`);
        return null;
      }

      const content = await this.readFile(filePath);
      if (!content) return null;

      const chunks = this.createChunks(content, path.basename(filePath));
      
      return {
        filename: path.basename(filePath),
        content,
        chunks,
        metadata: {
          filePath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        },
      };
    } catch (error) {
      console.error(`❌ Failed to process file: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Read file content
   */
  private async readFile(filePath: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      switch (ext) {
        case '.txt':
        case '.md':
          return await fs.readFile(filePath, 'utf-8');
        
        case '.json':
          const jsonContent = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(jsonContent);
          return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        
        default:
          console.warn(`⚠️ Unsupported file type: ${ext}`);
          return null;
      }
    } catch (error) {
      console.error(`❌ Failed to read file: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Create text chunks
   */
  private createChunks(content: string, filename: string): ChunkNode[] {
    const chunks: ChunkNode[] = [];
    const words = content.split(/\s+/);
    
    let startIndex = 0;
    let chunkIndex = 0;
    let contentOffset = 0; // Content offset
    const maxIterations = Math.ceil(words.length / (this.chunkSize - this.overlap)) + 10; // Prevent infinite loop
    let iterationCount = 0;

    while (startIndex < words.length && iterationCount < maxIterations) {
      const endIndex = Math.min(startIndex + this.chunkSize, words.length);
      
      // Prevent overlap calculation errors
      if (endIndex <= startIndex) {
        console.warn(`⚠️ Detected possible infinite loop, stopping chunking: startIndex=${startIndex}, endIndex=${endIndex}`);
        break;
      }
      
      const chunkWords = words.slice(startIndex, endIndex);
      const chunkText = chunkWords.join(' ');

      if (chunkText.trim()) {
        const position = chunkIndex + 1; // Position starts from 1
        const length = chunkText.length; // Chunk content length
        const chunkId = this.generateHash(chunkText); // Use content hash as ID
        
        const chunk: ChunkNode = {
          id: chunkId,
          labels: ['__Chunk__'],
          properties: {
            id: chunkId,
            text: chunkText,
            n_tokens: chunkWords.length,
            chunk_index: chunkIndex,
            document_id: this.generateDocumentId(filename),
            // Additional metadata fields
            position: position,
            length: length,
            content_offset: contentOffset,
            fileName: filename,
            tokens: chunkWords.length,
          },
        };

        chunks.push(chunk);
        chunkIndex++;
        
        // Update content offset (prepare for next chunk)
        contentOffset += length;
      }

      // Calculate next chunk start position, considering overlap
      const nextStartIndex = endIndex - this.overlap;
      
      // Prevent issues from excessive overlap
      if (nextStartIndex <= startIndex) {
        startIndex = endIndex; // Jump directly to next position
      } else {
        startIndex = nextStartIndex;
      }
      
      iterationCount++;
    }

    if (iterationCount >= maxIterations) {
      console.warn(`⚠️ Reached maximum iterations, stopping chunking: ${filename}`);
    }

    return chunks;
  }

  /**
   * Get supported file list
   */
  private async getSupportedFiles(dirPath: string): Promise<string[]> {
    const supportedExtensions = ['.txt', '.md', '.json'];
    const files: string[] = [];

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            files.push(path.join(dirPath, item.name));
          }
        }
      }

      return files.sort();
    } catch (error) {
      console.error(`❌ Failed to read directory: ${dirPath}`, error);
      return [];
    }
  }

  /**
   * Generate document ID
   */
  private generateDocumentId(filename: string): string {
    return crypto.createHash('md5').update(filename).digest('hex');
  }

  /**
   * Generate chunk ID
   */
  private generateChunkId(filename: string, chunkIndex: number): string {
    const content = `${filename}_${chunkIndex}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generate content hash
   */
  private generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

export default DocumentProcessor; 