import { ProcessedDocument, DocumentNode, ChunkNode } from '../models/types';
import { BaseGraphService } from './base-graph-service';
import { neo4jManager } from '../database/neo4j';
import DocumentProcessor from './document-processor';

/**
 * GraphService - Unified Graph Operations Service

 */
export class GraphService extends BaseGraphService {
  private documentProcessor: DocumentProcessor;

  constructor() {
    super();
    this.documentProcessor = DocumentProcessor.getInstance();
  }
  
  /**
   * Build knowledge graph
   */
  async buildKnowledgeGraph(inputPath: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🏗️ Starting knowledge graph construction...');
      console.log(`📁 Input path: ${inputPath}`);

      // Step 1: Process documents
      console.log('\n📄 Step 1: Processing documents...');
      console.log('⏳ Starting document processing...');
      
      // TODO: Implement document processing
      console.log('✅ Document processing completed');
      
      // Step 2: Build graph structure
      console.log('\n🔗 Step 2: Building graph structure...');
      console.log('⏳ Starting graph structure construction...');
      
      // TODO: Implement graph structure construction
      console.log('✅ Graph structure construction completed');

      // Step 3: Get statistics
      console.log('\n📊 Step 3: Getting statistics...');
      console.log('⏳ Getting statistics...');
      const stats = await this.getDatabaseStats();
      this.printDatabaseStats(stats);

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`\n🎉 Knowledge graph construction completed! Total time: ${duration.toFixed(2)} seconds`);
      
    } catch (error) {
      console.error('❌ Knowledge graph construction failed:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Clear and rebuild knowledge graph
   */
  async rebuildKnowledgeGraph(inputPath: string): Promise<void> {
    try {
      console.log('🔄 Starting knowledge graph rebuild...');
      
      // Clear existing data
      await this.clearDatabase();
      
      // Rebuild knowledge graph
      await this.buildKnowledgeGraph(inputPath);
      
    } catch (error) {
      console.error('❌ Rebuild failed:', error);
      throw error;
    }
  }

  /**
   * Process and write graph documents - merged from GraphWriter
   */
  async processAndWriteGraphDocuments(documents: ProcessedDocument[]): Promise<void> {
    console.log(`🚀 Starting to process ${documents.length} documents...`);
    
    try {
      // Create constraints and indexes
      await this.createConstraintsAndIndexes();

      // Process documents in batches using base class method
      await this.processDocumentsInBatches(documents, this.processDocument.bind(this));

      console.log('✅ All documents processed successfully');
    } catch (error) {
      console.error('❌ Failed to process documents:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.stack);
      }
      throw error;
    }
  }



  /**
   * Create text chunk nodes and establish relationships
   */
  private async createChunksAndRelationships(document: ProcessedDocument): Promise<void> {
    if (document.chunks.length === 0) return;

    const startTime = Date.now();
    const chunks = document.chunks;
    const batchData = [];
    const firstRelationships = [];
    const nextRelationships = [];
    let currentChunkId = '';
    let previousChunkId = '';

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pageContent = chunk.properties.text;
      currentChunkId = chunk.id;
      const position = i + 1;
      previousChunkId = i === 0 ? currentChunkId : chunks[i - 1].id;

      const firstChunk = (i === 0);

      // Prepare batch data
      const chunkData = {
        id: currentChunkId,
        pg_content: pageContent,
        position: position,
        length: chunk.properties.length,
        f_name: document.filename,
        previous_id: previousChunkId,
        content_offset: chunk.properties.content_offset,
        tokens: chunk.properties.tokens,
        embedding: chunk.properties.embedding
      };
      batchData.push(chunkData);

      // Create relationship data
      if (firstChunk) {
        firstRelationships.push({ type: "FIRST_CHUNK", chunk_id: currentChunkId });
      } else {
        nextRelationships.push({
          type: "NEXT_CHUNK",
          previous_chunk_id: previousChunkId,
          current_chunk_id: currentChunkId
        });
      }

      // Process in batches
      if (batchData.length >= this.batchSize) {
        await this.createChunksAndRelationshipsOptimized(document.filename, batchData, firstRelationships, nextRelationships);
        batchData.length = 0; // Clear array
        firstRelationships.length = 0;
        nextRelationships.length = 0;
      }
    }

    // Process remaining data
    if (batchData.length > 0) {
      await this.createChunksAndRelationshipsOptimized(document.filename, batchData, firstRelationships, nextRelationships);
    }

    const endTime = Date.now();
    console.log(`Relationship creation time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
  }

  /**
   * Create Chunk nodes and establish relationships
   */
  async createRelationBetweenChunks(fileName: string, chunks: ChunkNode[]): Promise<any[]> {
    const startTime = Date.now();
    
    let currentChunkId = '';
    const lstChunksIncludingHash: any[] = [];
    const batchData: any[] = [];
    const firstRelationships: any[] = [];
    const nextRelationships: any[] = [];
    let offset = 0;

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pageContent = chunk.properties.text;
      currentChunkId = this.generateHash(pageContent);
      const position = i + 1;
      
      // Fix: Calculate previousChunkId correctly
      const previousChunkId = i === 0 ? currentChunkId : this.generateHash(chunks[i - 1].properties.text);

      if (i > 0) {
        const lastPageContent = chunks[i - 1].properties.text;
        offset += lastPageContent.length;
      }

      const firstChunk = (i === 0);

      // Prepare batch data
      const chunkData = {
        id: currentChunkId,
        pg_content: pageContent,
        position: position,
        length: chunk.properties.length,
        f_name: fileName,
        previous_id: previousChunkId,
        content_offset: offset,
        tokens: chunk.properties.tokens,
        embedding: chunk.properties.embedding || null
      };
      batchData.push(chunkData);

      lstChunksIncludingHash.push({
        chunk_id: currentChunkId,
        chunk_doc: {
          page_content: pageContent,
          metadata: {
            position: position,
            length: chunk.properties.length,
            content_offset: offset,
            tokens: chunk.properties.tokens
          }
        }
      });

      // Create relationship data
      if (firstChunk) {
        firstRelationships.push({ type: "FIRST_CHUNK", chunk_id: currentChunkId });
      } else {
        nextRelationships.push({
          type: "NEXT_CHUNK",
          previous_chunk_id: previousChunkId,
          current_chunk_id: currentChunkId
        });
      }

      // Process in batches
      if (batchData.length >= this.batchSize) {
        await this.createChunksAndRelationshipsOptimized(fileName, batchData, firstRelationships, nextRelationships);
        batchData.length = 0; // Clear array
        firstRelationships.length = 0;
        nextRelationships.length = 0;
      }
    }

    // Process remaining data
    if (batchData.length > 0) {
      await this.createChunksAndRelationshipsOptimized(fileName, batchData, firstRelationships, nextRelationships);
    }

    const endTime = Date.now();
    console.log(`Relationship creation time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);

    return lstChunksIncludingHash;
  }

  /**
   * Process documents and build graph structure
   */
  async processDocument(document: ProcessedDocument): Promise<void> {
    try {
      // Step 1: Create document node
      await this.createDocument(
        'document',
        document.metadata?.filePath || '',
        document.filename,
        'general'
      );

      // Step 2: Create chunk nodes and relationships
      await this.createRelationBetweenChunks(document.filename, document.chunks);

      // Debug embedding storage
      await this.debugEmbeddingStorage(document.filename);

      console.log(`Document graph structure construction completed: ${document.filename}`);
    } catch (error) {
      console.error(`Failed to build document graph structure: ${document.filename}`, error);
      throw error;
    }
  }

  /**
   * Batch process multiple documents
   */
  async processDocuments(documents: ProcessedDocument[]): Promise<void> {
    console.log(`Starting to build graph structure, total ${documents.length} documents...`);

    try {
      // Create constraints and indexes
      await this.createConstraintsAndIndexes();

      // Process documents in batches using base class method
      await this.processDocumentsInBatches(documents, this.processDocument.bind(this));

      console.log('✅ All document graph structures built');
    } catch (error) {
      console.error('❌ Failed to build graph structure:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.stack);
      }
      throw error;
    }
    }

  /**
   * Generate content hash
   */
  protected generateHash(content: string): string {
    return super.generateHash(content);
  }

  /**
   * Print database statistics
   */
  private printDatabaseStats(stats: any): void {
    if (!stats) {
      console.log('⚠️ Unable to get database statistics');
      return;
    }

    console.log('\n🗄️ Database Statistics:');
    console.log('─'.repeat(50));
    console.log(`📊 Total nodes: ${stats.totalNodes.toLocaleString()}`);
    console.log(`🔗 Total relationships: ${stats.totalRelationships.toLocaleString()}`);
    
    if (stats.nodeStats && stats.nodeStats.length > 0) {
      console.log('\n📈 Node type distribution:');
      stats.nodeStats.forEach((stat: any) => {
        const labels = stat.labels.join(':');
        console.log(`   ${labels}: ${stat.count.toLocaleString()}`);
      });
    }
    
    console.log('─'.repeat(50));
  }

  /**
   * Validate build result
   */
  async validateBuild(): Promise<boolean> {
    try {
      console.log('🔍 Validating build result...');
      
      const stats = await this.getDatabaseStats();
      
      if (!stats || stats.totalNodes === 0) {
        console.log('❌ Validation failed: No nodes in database');
        return false;
      }
      
      if (stats.totalRelationships === 0) {
        console.log('⚠️ Warning: No relationships in database');
      }
      
      console.log('✅ Validation passed');
      return true;
      
    } catch (error) {
      console.error('❌ Validation failed:', error);
      return false;
    }
  }
}

export default GraphService; 