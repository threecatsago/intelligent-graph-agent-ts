import neo4j from 'neo4j-driver';
import { neo4jManager } from '../../database/neo4j';
import { EmbeddingModel } from '../embedding-manager';

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: {
    fileName?: string;
    documentId?: string;
    chunkIndex?: number;
    [key: string]: any;
  };
}

export interface SearchOptions {
  topK?: number; // Will be converted to integer internally
  threshold?: number;
  includeAdjacentChunks?: boolean; // Whether to include adjacent chunks
  contextWindow?: number; // Context window size (how many chunks before and after)
}

// Utility function to ensure topK is an integer
function ensureIntegerTopK(topK: number | undefined, defaultValue: number = 10): number {
  if (topK === undefined || topK === null) {
    return defaultValue;
  }
  return Math.floor(topK);
}

export class VectorSearchService {
  private embeddingModel: EmbeddingModel;

  constructor(embeddingModel: EmbeddingModel) {
    this.embeddingModel = embeddingModel;
  }

  /**
   * Perform vector similarity search
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      console.log(`🔍 Executing vector search: "${query}"`);
      
      // 1. Convert query to vector
      const queryVector = await this.embeddingModel.embedQuery(query);
      console.log(`   ✅ Query vectorization completed (${queryVector.length} dimensions)`);
      
      // 2. Search for similar vectors in database
      const results = await this.searchSimilarVectors(queryVector, options);
      console.log(`   📊 Found ${results.length} relevant results`);
      
      return results;
    } catch (error) {
      console.error('❌ Vector search failed:', error);
      throw error;
    }
  }

  /**
   * Search for similar vectors
   */
  private async searchSimilarVectors(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const topK = ensureIntegerTopK(options.topK, 10);
    const threshold = options.threshold || 0.5;
    
    try {
      // Ensure topK is integer
      const cypherQuery = `
          MATCH (c:__Chunk__)
          WHERE c.embedding IS NOT NULL
          WITH c, gds.similarity.cosine(c.embedding, $queryVector) AS similarity
          WHERE similarity >= $threshold
        RETURN c.id as id, c.text as text, similarity as score, c.chunk_index as chunkIndex,
               c.fileName as fileName, c.document_id as documentId
          ORDER BY similarity DESC
        LIMIT $topK
      `;

      const results = await neo4jManager.executeQuery(cypherQuery, {
        queryVector,
        threshold,
        topK: neo4j.int(topK)
      });

      return results.map((result: any) => ({
        id: result.id,
        text: result.text,
        score: result.score,
        metadata: {
          fileName: result.fileName,
          documentId: result.documentId,
          chunkIndex: result.chunkIndex
        }
      }));
      
    } catch (error) {
      console.error('❌ Failed to search similar vectors:', error);
      throw error;
    }
  }

  /**
   * Search with context expansion
   */
  async searchWithContext(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    console.log(`🔍 Starting searchWithContext with options:`, {
      includeAdjacentChunks: options.includeAdjacentChunks,
      contextWindow: options.contextWindow
    });
    
    const results = await this.search(query, options);
    console.log(`   📊 Initial search results: ${results.length}`);
    
    if (!options.includeAdjacentChunks || results.length === 0) {
      console.log(`   ⏭️ Skipping context expansion (includeAdjacentChunks: ${options.includeAdjacentChunks}, results: ${results.length})`);
      return results;
    }

    const contextWindow = Math.floor(options.contextWindow || 2);
    const expandedResults: SearchResult[] = [];

    for (const result of results) {
      expandedResults.push(result);
      
      // Get adjacent chunks
      console.log(`   🔍 Getting adjacent chunks for result: ${result.id}`);
      const adjacentChunks = await this.getAdjacentChunks(result.id, contextWindow);
      console.log(`   📊 Found ${adjacentChunks.length} adjacent chunks`);
      expandedResults.push(...adjacentChunks);
    }

    console.log(`   📊 Total results before deduplication: ${expandedResults.length}`);
    
    // Remove duplicates and sort by score
    const uniqueResults = this.removeDuplicates(expandedResults);
    console.log(`   📊 Results after deduplication: ${uniqueResults.length}`);
    
    const sortedResults = uniqueResults.sort((a, b) => b.score - a.score);
    console.log(`   ✅ Context expansion completed, final results: ${sortedResults.length}`);
    
    return sortedResults;
  }

  /**
   * Get adjacent chunks
   */
  private async getAdjacentChunks(chunkId: string, contextWindow: number): Promise<SearchResult[]> {
    try {
      console.log(`   🔍 Executing adjacent chunks query for chunkId: ${chunkId}, contextWindow: ${contextWindow}`);
      
      // Ensure contextWindow is an integer for Neo4j
      const contextWindowInt = Math.floor(contextWindow);
      
      // First, let's check if the chunk exists and has NEXT_CHUNK relationships
      const checkQuery = `
        MATCH (c:__Chunk__ {id: $chunkId})
        OPTIONAL MATCH (c)-[:NEXT_CHUNK]->(next:__Chunk__)
        OPTIONAL MATCH (c)<-[:NEXT_CHUNK]-(prev:__Chunk__)
        RETURN c.id as currentId, 
               count(next) as nextCount, 
               count(prev) as prevCount,
               c.chunk_index as currentIndex
      `;
      
      const checkResult = await neo4jManager.executeQuery(checkQuery, { chunkId });
      console.log(`   🔍 Chunk check result:`, checkResult[0]);
      
      if (checkResult.length === 0) {
        console.log(`   ⚠️ Chunk ${chunkId} not found`);
        return [];
      }
      
      // Note: Neo4j does not allow parameters inside variable-length patterns.
      // We inline the numeric upper bound while keeping node properties parameterized.
      const cypherQuery = `
        MATCH (c:__Chunk__ {id: $chunkId})-[:NEXT_CHUNK*1..${contextWindowInt}]->(adj:__Chunk__)
        RETURN adj.id as id, adj.text as text, 0.8 as score, adj.chunk_index as chunkIndex,
               adj.fileName as fileName, adj.document_id as documentId
        UNION
        MATCH (c:__Chunk__ {id: $chunkId})<-[:NEXT_CHUNK*1..${contextWindowInt}]-(prev:__Chunk__)
        RETURN prev.id as id, prev.text as text, 0.8 as score, prev.chunk_index as chunkIndex,
               prev.fileName as fileName, prev.document_id as documentId
      `;

      console.log(`   🔍 Cypher query:`, cypherQuery.replace(/\s+/g, ' ').trim());

      const results = await neo4jManager.executeQuery(cypherQuery, { 
        chunkId
      });

      console.log(`   📊 Raw adjacent chunks results: ${results.length}`);

      const mappedResults = results.map((result: any) => ({
        id: result.id,
        text: result.text,
        score: result.score,
        metadata: {
          fileName: result.fileName,
          documentId: result.documentId,
          chunkIndex: result.chunkIndex
        }
      }));

      console.log(`   ✅ Mapped adjacent chunks: ${mappedResults.length}`);
      return mappedResults;
      
    } catch (error) {
      console.error('❌ Failed to get adjacent chunks:', error);
      return [];
    }
  }

  /**
   * Remove duplicate results
   */
  private removeDuplicates(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (seen.has(result.id)) {
        return false;
      }
      seen.add(result.id);
      return true;
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testVector = await this.embeddingModel.embedQuery('test');
      return testVector.length > 0;
    } catch (error) {
      console.error('❌ Vector search health check failed:', error);
      return false;
    }
  }
} 