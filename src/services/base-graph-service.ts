import neo4j from 'neo4j-driver';
import { neo4jManager } from '../database/neo4j';
import { ProcessedDocument, DocumentNode, ChunkNode } from '../models/types';
import { getBatchConfig } from '../config/unified-config';

/**
 * Graph service base class - all graph operation services
 */
export abstract class BaseGraphService {
  protected batchSize: number;
  protected maxWorkers: number;

  constructor() {
    const batchConfig = getBatchConfig();
    this.batchSize = batchConfig.size;
    this.maxWorkers = batchConfig.maxWorkers;
  }

  /**
   * Clear database
   */
  public async clearDatabase(): Promise<void> {
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
   * Create document node
   */
  protected async createDocument(
    type: string, 
    uri: string, 
    fileName: string, 
    domain: string
  ): Promise<any> {
    const query = `
      MERGE (d:__Document__ {fileName: $fileName})
      SET d.type = $type,
          d.uri = $uri,
          d.domain = $domain
      RETURN d
    `;
    
    const doc = await neo4jManager.executeWriteQuery(query, {
      fileName,
      type,
      uri,
      domain
    });
    
    return doc;
  }

  /**
   * Create constraints and indexes
   */
  protected async createConstraintsAndIndexes(): Promise<void> {
    try {
      console.log('⏳ Creating constraints...');
      await neo4jManager.createConstraints();
      console.log('✅ Constraints created successfully');
      
      console.log('⏳ Creating indexes...');
      await neo4jManager.createIndexes();
      console.log('✅ Indexes created successfully');
    } catch (error) {
      console.error('❌ Failed to create constraints and indexes:', error);
      throw error;
    }
  }

  /**
   * Optimized chunk and relationship creation
   */
  protected async createChunksAndRelationshipsOptimized(
    fileName: string,
    batchData: any[],
    firstRelationships: any[],
    nextRelationships: any[]
  ): Promise<void> {
    if (batchData.length === 0) return;

    try {
      // Create Chunk nodes and PART_OF relationships
      const queryChunksAndPartOf = `
        UNWIND $batchData AS data
        MERGE (c:__Chunk__ {id: data.id})
        SET c.text = data.pg_content,
            c.position = data.position,
            c.length = data.length,
            c.fileName = data.f_name,
            c.content_offset = data.content_offset,
            c.tokens = data.tokens,
            c.chunk_index = data.position,
            c.embedding = CASE 
              WHEN data.embedding IS NOT NULL THEN data.embedding 
              ELSE null 
            END
        WITH c, data, data.f_name AS fileName
        MATCH (d:__Document__ {fileName: fileName})
        MERGE (c)-[:PART_OF]->(d)
      `;
      await neo4jManager.executeWriteQuery(queryChunksAndPartOf, { batchData });
      console.log('✅ Chunk nodes and PART_OF relationships created');

      // Process FIRST_CHUNK relationships
      if (firstRelationships.length > 0) {
        const queryFirstChunk = `
          UNWIND $relationships AS relationship
          WITH relationship.chunk_id AS chunkId
          MATCH (d:__Document__ {fileName: $f_name})
          MATCH (c:__Chunk__ {id: chunkId})
          MERGE (d)-[:FIRST_CHUNK]->(c)
        `;
        await neo4jManager.executeWriteQuery(queryFirstChunk, {
          f_name: fileName,
          relationships: firstRelationships
        });
        console.log('✅ FIRST_CHUNK relationships created');
      }

      // Process NEXT_CHUNK relationships
      if (nextRelationships.length > 0) {
        const queryNextChunk = `
          UNWIND $relationships AS relationship
          WITH relationship.current_chunk_id AS currentChunkId, relationship.previous_chunk_id AS previousChunkId
          MATCH (c:__Chunk__ {id: currentChunkId})
          MATCH (pc:__Chunk__ {id: previousChunkId})
          MERGE (pc)-[:NEXT_CHUNK]->(c)
        `;
        await neo4jManager.executeWriteQuery(queryNextChunk, { relationships: nextRelationships });
        console.log('✅ NEXT_CHUNK relationships created');
      }
    } catch (error) {
      console.error('❌ Failed to create chunks and relationships:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  protected async getDatabaseStats(): Promise<any> {
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

  /**
   * Batch process documents
   */
  protected async processDocumentsInBatches(
    documents: ProcessedDocument[],
    processSingleDocument: (doc: ProcessedDocument) => Promise<void>
  ): Promise<void> {
    console.log(`📦 Processing ${documents.length} documents in batches...`);
    
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(documents.length / this.batchSize)}`);
      
      const promises = batch.map(doc => processSingleDocument(doc));
      await Promise.all(promises);
    }
    
    console.log('✅ All documents processed successfully');
  }

  /**
   * Generate content hash
   */
  protected generateHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Debug method to check embedding storage
   */
  protected async debugEmbeddingStorage(fileName: string): Promise<void> {
    try {
      const query = `
        MATCH (c:__Chunk__ {fileName: $fileName})
        RETURN c.id, c.text, c.embedding, size(c.embedding) as embeddingSize
        LIMIT 5
      `;
      
      const results = await neo4jManager.executeQuery(query, { fileName });
      
      console.log(`🔍 Debug embedding storage for ${fileName}:`);
      results.forEach((result, index) => {
        console.log(`   Chunk ${index + 1}:`);
        console.log(`     ID: ${result['c.id']}`);
        console.log(`     Text: ${result['c.text']?.substring(0, 50)}...`);
        console.log(`     Embedding: ${result['c.embedding'] ? 'Present' : 'Missing'}`);
        console.log(`     Embedding Size: ${result['embeddingSize'] || 0}`);
      });
    } catch (error) {
      console.error('❌ Debug embedding storage failed:', error);
    }
  }
} 