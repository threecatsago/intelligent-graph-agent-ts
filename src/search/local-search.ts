import { neo4jManager } from '../database/neo4j';
import { SearchQuery, SearchResult } from '../models/types';

export class LocalSearch {
  /**
   * Search related text chunks
   */
  async searchChunks(query: SearchQuery): Promise<SearchResult[]> {
    try {
      console.log(`🔍 Searching text chunks: "${query.query}"`);
      
      const limit = Math.floor(query.limit || 10);
      const cypherQuery = `
        MATCH (c:__Chunk__)
        WHERE c.text CONTAINS $query
        RETURN c.text as content, c.id as source, 
               size([x IN split(toLower(c.text), toLower($query)) WHERE x <> '']) as score
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      
      const results = await neo4jManager.executeQuery(cypherQuery, {
        query: query.query,
      });

      console.log(`📊 Found ${results.length} results`);

      return results.map((result: any) => ({
        content: result.content,
        source: result.source,
        score: result.score,
        metadata: {
          type: 'chunk',
          chunkId: result.source,
        },
      }));
    } catch (error) {
      console.error('❌ Failed to search text chunks:', error);
      return [];
    }
  }

  /**
   * Search documents
   */
  async searchDocuments(query: SearchQuery): Promise<SearchResult[]> {
    try {
      const limit = Math.floor(query.limit || 5);
      const cypherQuery = `
        MATCH (d:__Document__)
        WHERE d.title CONTAINS $query OR d.filename CONTAINS $query
        RETURN d.title as content, d.filename as source, 
               size([x IN split(toLower(d.title), toLower($query)) WHERE x <> '']) as score
        ORDER BY score DESC
        LIMIT ${limit}
      `;

      const results = await neo4jManager.executeQuery(cypherQuery, {
        query: query.query,
      });

      return results.map((result: any) => ({
        content: result.content,
        source: result.source,
        score: result.score,
        metadata: {
          type: 'document',
          filename: result.source,
        },
      }));
    } catch (error) {
      console.error('❌ Failed to search documents:', error);
      return [];
    }
  }

  /**
   * Hybrid search (text chunks + documents)
   */
  async hybridSearch(query: SearchQuery): Promise<SearchResult[]> {
    try {
      console.log(`🔍 Hybrid search: "${query.query}"`);
      const [chunkResults, documentResults] = await Promise.all([
        this.searchChunks(query),
        this.searchDocuments(query),
      ]);

      // Merge results and sort by score
      const allResults = [...chunkResults, ...documentResults];
      allResults.sort((a, b) => {
        const scoreA = typeof a.score === 'object' && (a.score as any).low !== undefined ? (a.score as any).low : Number(a.score);
        const scoreB = typeof b.score === 'object' && (b.score as any).low !== undefined ? (b.score as any).low : Number(b.score);
        return scoreB - scoreA;
      });

      // Remove duplicates and limit result count
      const seen = new Set();
      const uniqueResults: SearchResult[] = [];
      
      for (const result of allResults) {
        const key = `${result.source}_${result.content.substring(0, 100)}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(result);
        }
        if (uniqueResults.length >= (query.limit || 10)) break;
      }

      console.log(`📊 Hybrid search found ${uniqueResults.length} results`);
      return uniqueResults;
    } catch (error) {
      console.error('❌ Hybrid search failed:', error);
      return [];
    }
  }

  /**
   * Get document content
   */
  async getDocumentContent(documentId: string): Promise<string | null> {
    try {
      const query = `
        MATCH (d:__Document__ {id: $documentId})
        RETURN d.content as content
      `;

      const results = await neo4jManager.executeQuery(query, { documentId });
      
      if (results.length > 0) {
        return results[0].content;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get document content:', error);
      return null;
    }
  }

  /**
   * Get text chunk content
   */
  async getChunkContent(chunkId: string): Promise<string | null> {
    try {
      const query = `
        MATCH (c:__Chunk__ {id: $chunkId})
        RETURN c.text as content
      `;

      const results = await neo4jManager.executeQuery(query, { chunkId });
      
      if (results.length > 0) {
        return results[0].content;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get text chunk content:', error);
      return null;
    }
  }

  /**
   * Get related context
   */
  async getContext(query: string, limit: number = 3): Promise<SearchResult[]> {
    try {
      const cypherQuery = `
        MATCH (c:__Chunk__)-[:PART_OF]->(d:__Document__)
        WHERE c.text CONTAINS $query
        RETURN c.text as content, d.filename as source, 
               size([x IN split(toLower(c.text), toLower($query)) WHERE x <> '']) as score,
               c.chunk_index as chunkIndex, d.title as documentTitle
        ORDER BY score DESC, c.chunk_index ASC
        LIMIT $limit
      `;

      const results = await neo4jManager.executeQuery(cypherQuery, {
        query,
        limit,
      });

      return results.map((result: any) => ({
        content: result.content,
        source: result.source,
        score: result.score,
        metadata: {
          type: 'context',
          chunkIndex: result.chunkIndex,
          documentTitle: result.documentTitle,
        },
      }));
    } catch (error) {
      console.error('❌ Failed to get context:', error);
      return [];
    }
  }
}

export default LocalSearch; 