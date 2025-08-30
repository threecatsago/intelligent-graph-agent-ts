import { neo4jManager } from '../database/neo4j';
import { ProcessedDocument, DocumentNode, ChunkNode } from '../models/types';
import { config } from '../config/settings';

export class GraphWriter {
  private batchSize: number;
  private maxWorkers: number;

  constructor(batchSize: number = config.batch.size, maxWorkers: number = config.batch.maxWorkers) {
    this.batchSize = batchSize;
    this.maxWorkers = maxWorkers;
  }

  /**
   * Batch process and write graph data
   */
  async processAndWriteGraphDocuments(documents: ProcessedDocument[]): Promise<void> {
    console.log(`🚀 Starting to process ${documents.length} documents...`);
    
    try {
      // Create constraints and indexes
      console.log('⏳ Creating constraints...');
      await neo4jManager.createConstraints();
      console.log('✅ Constraints created successfully');
      
      console.log('⏳ Creating indexes...');
      await neo4jManager.createIndexes();
      console.log('✅ Indexes created successfully');

      // Process documents in batches
      console.log('⏳ Starting document processing...');
      for (let i = 0; i < documents.length; i += this.batchSize) {
        const batch = documents.slice(i, i + this.batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(documents.length / this.batchSize)}`);
        
        await this.processBatch(batch);
      }

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
   * Process single batch
   */
  private async processBatch(documents: ProcessedDocument[]): Promise<void> {
    const promises = documents.map(doc => this.processDocument(doc));
    
    // Parallel processing, but limit concurrency
    for (let i = 0; i < promises.length; i += this.maxWorkers) {
      const batch = promises.slice(i, i + this.maxWorkers);
      await Promise.all(batch);
    }
  }

  /**
   * Process single document
   */
  private async processDocument(document: ProcessedDocument): Promise<void> {
    try {
      // 1. Create document node
      await this.createDocumentNode(document);
      
      // 2. Create text chunk nodes and establish relationships
      await this.createChunksAndRelationships(document);
      
      console.log(`✅ Document processed successfully: ${document.filename}`);
    } catch (error) {
      console.error(`❌ Failed to process document: ${document.filename}`, error);
      throw error;
    }
  }

  /**
   * Create document node
   */
  private async createDocumentNode(document: ProcessedDocument): Promise<void> {
    const query = `
      MERGE (d:__Document__ {fileName: $fileName})
      SET d.type = $type,
          d.uri = $uri,
          d.domain = $domain
      RETURN d
    `;

    const properties = {
      fileName: document.filename,
      type: 'document',
      uri: document.metadata?.filePath || '',
      domain: 'general'
    };

    console.log(`📄 Creating document node: ${document.filename}`);

    await neo4jManager.executeWriteQuery(query, properties);
  }

  /**
   * Create text chunk nodes and establish relationships
   */
  private async createChunksAndRelationships(document: ProcessedDocument): Promise<void> {
    if (document.chunks.length === 0) return;

    const startTime = Date.now();
    const chunks = document.chunks;
    const batchData = [];
    const relationships = [];
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
        tokens: chunk.properties.tokens
      };
      batchData.push(chunkData);

      // Create relationship data
      if (firstChunk) {
        relationships.push({ type: "FIRST_CHUNK", chunk_id: currentChunkId });
      } else {
        relationships.push({
          type: "NEXT_CHUNK",
          previous_chunk_id: previousChunkId,
          current_chunk_id: currentChunkId
        });
      }
    }

    // Batch processing
    await this.processBatchData(document.filename, batchData, relationships);

    const endTime = Date.now();
    console.log(`Relationship creation took: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
  }

  /**
   * Batch process data
   */
  private async processBatchData(fileName: string, batchData: any[], relationships: any[]): Promise<void> {
    if (batchData.length === 0) return;

    // Separate FIRST_CHUNK and NEXT_CHUNK relationships
    const firstRelationships = relationships.filter(r => r.type === "FIRST_CHUNK");
    const nextRelationships = relationships.filter(r => r.type === "NEXT_CHUNK");

    // Use optimized database operations
    await this.createChunksAndRelationshipsOptimized(fileName, batchData, firstRelationships, nextRelationships);
  }

  /**
   * Optimized query for creating chunks and relationships - Reduce database round trips
   */
  private async createChunksAndRelationshipsOptimized(
    fileName: string, 
    batchData: any[], 
    firstRelationships: any[], 
    nextRelationships: any[]
  ): Promise<void> {
    // Combined query: Create Chunk nodes and PART_OF relationships
    const queryChunksAndPartOf = `
      UNWIND $batchData AS data
      MERGE (c:__Chunk__ {id: data.id})
      SET c.text = data.pg_content,
          c.position = data.position,
          c.length = data.length,
          c.fileName = data.f_name,
          c.content_offset = data.content_offset,
          c.tokens = data.tokens
      WITH c, data
      MATCH (d:__Document__ {fileName: data.f_name})
      MERGE (c)-[:PART_OF]->(d)
    `;
    await neo4jManager.executeWriteQuery(queryChunksAndPartOf, { batchData });

    // Process FIRST_CHUNK relationships
    if (firstRelationships.length > 0) {
      const queryFirstChunk = `
        UNWIND $relationships AS relationship
        MATCH (d:__Document__ {fileName: $f_name})
        MATCH (c:__Chunk__ {id: relationship.chunk_id})
        MERGE (d)-[:FIRST_CHUNK]->(c)
      `;
      await neo4jManager.executeWriteQuery(queryFirstChunk, {
        f_name: fileName,
        relationships: firstRelationships
      });
    }

    // Process NEXT_CHUNK relationships
    if (nextRelationships.length > 0) {
      const queryNextChunk = `
        UNWIND $relationships AS relationship
        MATCH (c:__Chunk__ {id: relationship.current_chunk_id})
        MATCH (pc:__Chunk__ {id: relationship.previous_chunk_id})
        MERGE (pc)-[:NEXT_CHUNK]->(c)
      `;
      await neo4jManager.executeWriteQuery(queryNextChunk, { relationships: nextRelationships });
    }
  }

  /**
   * Clear database (for testing)
   */
  async clearDatabase(): Promise<void> {
    try {
      console.log('🧹 Clearing database...');
      
      const query = `
        MATCH (n)
        CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 25000 ROWS
      `;
      
      await neo4jManager.executeWriteQuery(query);
      console.log('✅ Database cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear database:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const stats = await neo4jManager.executeQuery(`
        MATCH (n)
        RETURN labels(n) as labels, count(n) as count
        ORDER BY count DESC
      `);

      const totalNodes = await neo4jManager.executeQuery(`
        MATCH (n) RETURN count(n) as total
      `);

      const totalRelationships = await neo4jManager.executeQuery(`
        MATCH ()-[r]->() RETURN count(r) as total
      `);

      return {
        nodeStats: stats,
        totalNodes: totalNodes[0]?.total || 0,
        totalRelationships: totalRelationships[0]?.total || 0,
      };
    } catch (error) {
      console.error('❌ Failed to get statistics:', error);
      return null;
    }
  }
}

export default GraphWriter; 