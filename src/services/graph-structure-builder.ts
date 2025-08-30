import { neo4jManager } from '../database/neo4j';
import { ProcessedDocument, ChunkNode } from '../models/types';
import { config } from '../config/settings';
import crypto from 'crypto';

/**
 * Graph structure builder, responsible for creating and managing document and chunk node structures in Neo4j.
 * Handles document node and chunk node creation, and relationship establishment between them.
 */
export class GraphStructureBuilder {
  private batchSize: number;

  constructor(batchSize: number = config.batch.size) {
    this.batchSize = batchSize;
  }

  /**
   * Clear database
   */
  async clearDatabase(): Promise<void> {
    const clearQuery = `
      MATCH (n)
      DETACH DELETE n
    `;
    await neo4jManager.executeWriteQuery(clearQuery);
  }

  /**
   * Create Document node
   */
  async createDocument(type: string, uri: string, fileName: string, domain: string): Promise<any> {
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
   * Generate content hash
   */
  private generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Create Chunk nodes and establish relationships - batch processing optimized version
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
      const previousChunkId = i === 0 ? currentChunkId : lstChunksIncludingHash[lstChunksIncludingHash.length - 1].chunk_id;

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
        tokens: chunk.properties.tokens
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

      // Batch process when accumulated enough data
      if (batchData.length >= this.batchSize) {
        await this.createChunksAndRelationshipsOptimized(fileName, batchData, firstRelationships, nextRelationships);
        batchData.length = 0; // Clear array
        // Clear relationship arrays since they've been processed
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
   * Optimized query for creating chunks and relationships - reduce database round trips
   */
  private async createChunksAndRelationshipsOptimized(
    fileName: string,
    batchData: any[],
    firstRelationships: any[],
    nextRelationships: any[]
  ): Promise<void> {
    console.log(`🔧 Starting to create Chunk nodes and relationships, batch size: ${batchData.length}`);
    console.log(`🔗 FIRST_CHUNK relationships count: ${firstRelationships.length}`);
    console.log(`🔗 NEXT_CHUNK relationships count: ${nextRelationships.length}`);

    // Combined query: create Chunk nodes and PART_OF relationships
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
    console.log('✅ Chunk nodes and PART_OF relationships created');

    // Handle FIRST_CHUNK relationships
    if (firstRelationships.length > 0) {
      console.log('🔗 Creating FIRST_CHUNK relationships...');
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
      console.log('✅ FIRST_CHUNK relationships created');
    }

    // Handle NEXT_CHUNK relationships
    if (nextRelationships.length > 0) {
      console.log('🔗 Creating NEXT_CHUNK relationships...');
      const queryNextChunk = `
        UNWIND $relationships AS relationship
        MATCH (c:__Chunk__ {id: relationship.current_chunk_id})
        MATCH (pc:__Chunk__ {id: relationship.previous_chunk_id})
        MERGE (pc)-[:NEXT_CHUNK]->(c)
      `;
      await neo4jManager.executeWriteQuery(queryNextChunk, { relationships: nextRelationships });
      console.log('✅ NEXT_CHUNK relationships created');
    }
  }

  /**
   * Process document and build graph structure
   */
  async processDocument(document: ProcessedDocument): Promise<void> {
    try {
      // 1. Create document node
      await this.createDocument(
        'document',
        document.metadata?.filePath || '',
        document.filename,
        'general'
      );

      // 2. Create Chunk nodes and establish relationships
      await this.createRelationBetweenChunks(document.filename, document.chunks);

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
      console.log('⏳ Creating constraints...');
      await neo4jManager.createConstraints();
      console.log('✅ Constraints created');

      console.log('⏳ Creating indexes...');
      await neo4jManager.createIndexes();
      console.log('✅ Indexes created');

      // Process documents in batches
      console.log('⏳ Starting document processing...');
      for (let i = 0; i < documents.length; i += this.batchSize) {
        const batch = documents.slice(i, i + this.batchSize);
        console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(documents.length / this.batchSize)}`);

        const promises = batch.map(doc => this.processDocument(doc));
        await Promise.all(promises);
      }

      console.log('✅ All document graph structures built');
    } catch (error) {
      console.error('❌ Failed to build graph structure:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.stack);
      }
      throw error;
    }
  }
}

export default GraphStructureBuilder; 