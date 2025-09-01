import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ProcessedDocument, ChunkNode } from '../models/types';
import { EnhancedTextChunker } from './enhanced-text-chunker';
import { embeddingManager } from './embedding-manager';
import { getDocumentProcessingConfig } from '../config/unified-config';

export class DocumentProcessor {
  private static instance: DocumentProcessor | null = null;
  private chunkSize: number;
  private overlap: number;
  private maxFileSize: number;
  private textChunker: EnhancedTextChunker;

  private constructor() {
    const documentConfig = getDocumentProcessingConfig();
    
    this.chunkSize = documentConfig.chunkSize;
    this.overlap = documentConfig.overlap;
    this.maxFileSize = documentConfig.maxFileSize;
    
    // Initialize enhanced text chunker
    this.textChunker = new EnhancedTextChunker({
      chunkSize: this.chunkSize,
      overlap: this.overlap,
      maxTextLength: documentConfig.maxTextLength,
      preserveSentences: documentConfig.preserveSentences,
      multilingualSupport: documentConfig.multilingualSupport,
    });

    console.log('📄 DocumentProcessor initialized with unified configuration');
  }

  public static getInstance(): DocumentProcessor {
    if (!DocumentProcessor.instance) {
      DocumentProcessor.instance = new DocumentProcessor();
    }
    return DocumentProcessor.instance;
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

      // Create chunks using enhanced text chunker
      const chunks = await this.createChunks(content, path.basename(filePath));
      
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
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.trim();
    } catch (error) {
      console.error(`❌ Failed to read file: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Create text chunks using enhanced text chunker
   */
  private async createChunks(content: string, filename: string): Promise<ChunkNode[]> {
    const chunks: ChunkNode[] = [];
    
    // Split text using enhanced text chunker
    const textChunks = this.textChunker.chunkText(content);
    
    console.log(`📝 Processing file: ${filename}`);
    console.log(`   📊 Text stats:`, this.textChunker.getTextStats(content));
    console.log(`   🔪 Created ${textChunks.length} chunks`);

    // Convert to ChunkNode format and generate embeddings
    for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
      const chunkText = textChunks[chunkIndex];
      
      if (chunkText.trim()) {
        const chunkId = this.generateHash(chunkText);
        const words = chunkText.split(/\s+/).filter(word => word.trim());
        
        // Generate embedding for chunk
        let embedding: number[] | undefined;
        try {
          console.log(`   🔄 Generating embedding for chunk ${chunkIndex + 1}/${textChunks.length}`);
          embedding = await embeddingManager.embedQuery(chunkText);
          console.log(`   ✅ Generated embedding (${embedding.length} dimensions) for chunk ${chunkIndex + 1}`);
          
          // Validate embedding
          if (!embedding || embedding.length === 0) {
            console.warn(`   ⚠️ Empty embedding generated for chunk ${chunkIndex + 1}`);
            embedding = undefined;
          }
        } catch (error) {
          console.warn(`   ⚠️ Failed to generate embedding for chunk ${chunkIndex + 1}:`, error);
          embedding = undefined;
        }
        
        const chunk: ChunkNode = {
          id: chunkId,
          labels: ['__Chunk__'],
          properties: {
            id: chunkId,
            text: chunkText,
            n_tokens: words.length,
            chunk_index: chunkIndex,
            document_id: this.generateDocumentId(filename),
            // Additional metadata fields
            position: chunkIndex + 1,
            length: chunkText.length,
            content_offset: this.calculateContentOffset(textChunks, chunkIndex),
            fileName: filename,
            tokens: words.length,
            embedding: embedding, // Add embedding field
          },
        };

        chunks.push(chunk);
      }
    }

    console.log(`   ✅ Successfully created ${chunks.length} chunk nodes with embeddings`);
    return chunks;
  }

  /**
   * Calculate content offset for a chunk
   */
  private calculateContentOffset(textChunks: string[], currentIndex: number): number {
    let offset = 0;
    for (let i = 0; i < currentIndex; i++) {
      offset += textChunks[i].length;
    }
    return offset;
  }

  /**
   * Generate document ID
   */
  private generateDocumentId(filename: string): string {
    return this.generateHash(filename);
  }

  /**
   * Generate hash for content
   */
  private generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
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
}

export default DocumentProcessor; 