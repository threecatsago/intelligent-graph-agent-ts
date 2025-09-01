import neo4j from 'neo4j-driver';
import { neo4jManager } from '../database/neo4j';
import { SearchQuery, SearchResult } from '../models/types';
import { serviceManager } from '../services/service-manager';

export interface SearchStrategy {
  name: string;
  description: string;
  useVectorSearch: boolean;
  useTextSearch: boolean;
  vectorSearchOptions?: {
    topK?: number;
    threshold?: number;
  };
  textSearchOptions?: {
    limit?: number;
  };
}

export interface UnifiedSearchOptions {
  strategy?: string | SearchStrategy;
  fallbackToText?: boolean;
  enableQA?: boolean;
  qaOptions?: {
    topK?: number;
    threshold?: number;
  };
}

export class UnifiedSearch {
  private static instance: UnifiedSearch | null = null;
  private vectorSearchService: any;
  private qaService: any;
  
  // Predefined search strategies
  private readonly searchStrategies: Map<string, SearchStrategy> = new Map([
    ['vector-only', {
      name: 'vector-only', 
      description: 'Only use vector search, suitable for semantic queries',
      useVectorSearch: true,
      useTextSearch: false,
      vectorSearchOptions: { 
        topK: 8, 
        threshold: 0.5,
        includeAdjacentChunks: false,
        contextWindow: 2
      }
    }],
    ['hybrid-vector-heavy', {
      name: 'hybrid-vector-heavy',
      description: 'Hybrid search with vector search as primary, suitable for complex semantic queries',
      useVectorSearch: true,
      useTextSearch: true,
      vectorSearchOptions: { 
        topK: 8, 
        threshold: 0.5,
        includeAdjacentChunks: true,
        contextWindow: 2
      },
      textSearchOptions: { limit: 2 }
    }],
    ['vector-with-context', {
      name: 'vector-with-context',
      description: 'Vector search + context expansion, provides more complete answer context (default strategy)',
      useVectorSearch: true,
      useTextSearch: false,
      vectorSearchOptions: { 
        topK: 8, 
        threshold: 0.5,
        includeAdjacentChunks: true,
        contextWindow: 2
      }
    }]
  ]);

  private constructor() {
    // Use ServiceManager to get service instances
    this.vectorSearchService = serviceManager.getVectorSearchService();
    this.qaService = serviceManager.getQAService();
    
    console.log('🔍 UnifiedSearch initialized with ServiceManager');
  }

  public static getInstance(): UnifiedSearch {
    if (!UnifiedSearch.instance) {
      UnifiedSearch.instance = new UnifiedSearch();
    }
    return UnifiedSearch.instance;
  }

  /**
   * Get all available search strategies
   */
  getAvailableStrategies(): SearchStrategy[] {
    return Array.from(this.searchStrategies.values());
  }

  /**
   * Get search strategy
   */
  getStrategy(strategyName: string): SearchStrategy | undefined {
    return this.searchStrategies.get(strategyName);
  }

  /**
   * Add custom search strategy
   */
  addStrategy(strategy: SearchStrategy): void {
    this.searchStrategies.set(strategy.name, strategy);
  }

  /**
   * Unified search method
   */
  async search(query: SearchQuery, options: UnifiedSearchOptions = {}): Promise<SearchResult[]> {
    try {
      console.log(`🔍 Unified search: "${query.query}"`);
      
      const strategy = this.resolveStrategy(options.strategy);
      console.log(`   📋 Using strategy: ${strategy.name} - ${strategy.description}`);
      
      const results: SearchResult[] = [];

      // 1. Vector search
      if (strategy.useVectorSearch) {
        try {
          const vectorResults = await this.performVectorSearch(query, strategy.vectorSearchOptions);
          
          // Add debug information
          console.log(`   🔍 Vector search result validation: ${vectorResults.length} results`);
          if (vectorResults.length > 0) {
            console.log(`   📋 First vector result:`, {
              hasContent: !!vectorResults[0].content,
              contentType: typeof vectorResults[0].content,
              contentLength: vectorResults[0].content?.length || 0,
              hasSource: !!vectorResults[0].source,
              hasScore: vectorResults[0].score !== undefined
            });
          }
          
          results.push(...vectorResults);
          console.log(`   📊 Vector search found ${vectorResults.length} results`);
        } catch (error) {
          console.warn('⚠️ Vector search failed:', error);
          if (!strategy.useTextSearch && options.fallbackToText !== false) {
            console.log('   🔄 Fallback to text search');
            const textResults = await this.performTextSearch(query, { limit: Math.floor(query.limit || 10) });
            results.push(...textResults);
          }
        }
      }

      // 2. Text search
      if (strategy.useTextSearch) {
        try {
          const textResults = await this.performTextSearch(query, strategy.textSearchOptions);
          
          // Add debug information
          console.log(`   🔍 Text search result validation: ${textResults.length} results`);
          if (textResults.length > 0) {
            console.log(`   📋 First text result:`, {
              hasContent: !!textResults[0].content,
              contentType: typeof textResults[0].content,
              contentLength: textResults[0].content?.length || 0,
              hasSource: !!textResults[0].source,
              hasScore: textResults[0].score !== undefined
            });
          }
          
          results.push(...textResults);
          console.log(`   📊 Text search found ${textResults.length} results`);
        } catch (error) {
          console.warn('⚠️ Text search failed:', error);
        }
      }

      // 3. Result optimization
      // Use strategy's topK if available, otherwise fall back to query limit
      const resultLimit = strategy.vectorSearchOptions?.topK || Math.floor(query.limit || 10);
      const optimizedResults = this.optimizeResults(results, resultLimit);
      
      console.log(`📊 Unified search completed, final results: ${optimizedResults.length} (limit: ${resultLimit})`);
      return optimizedResults;

    } catch (error) {
      console.error('❌ Unified search failed:', error);
      return [];
    }
  }

  /**
   * Smart QA
   */
  async askQuestion(question: string, options: UnifiedSearchOptions = {}): Promise<{
    answer: string;
    confidence: number;
    sources: any[];
    searchResults: SearchResult[];
  }> {
    try {
      console.log(`🤖 Smart QA: "${question}"`);
      
      // Use hybrid strategy for one-time search, avoid duplicate search
      const searchResults = await this.search(
        { query: question, limit: options.qaOptions?.topK || 5 },
        { strategy: 'hybrid-vector-heavy' }  // Use hybrid strategy, one search to get best results
      );

      if (searchResults.length === 0) {
        return {
          answer: 'Sorry, I could not find relevant information to answer your question.',
          confidence: 0,
          sources: [],
          searchResults: []
        };
      }

      console.log(`📊 Search completed, found ${searchResults.length} relevant results, starting to generate answer...`);

      // Convert search result format to match QA service expected format
      const convertedSearchResults = searchResults.map(result => ({
        id: result.metadata?.chunkId || result.source,
        text: result.content,
        score: result.score,
        metadata: {
          documentId: result.metadata?.documentId || result.source,
          chunkIndex: result.metadata?.chunkIndex || 0,
          fileName: result.source
        }
      }));

      // Directly use search results to generate answer, avoid duplicate search in QA service
      const qaResult = await this.qaService.generateAnswerFromResults(question, convertedSearchResults);

      return {
        answer: qaResult.answer,
        confidence: qaResult.confidence,
        sources: qaResult.sources,
        searchResults: qaResult.searchResults.map((result: any) => ({
          content: result.text,
          source: result.metadata.fileName || result.id,
          score: result.score,
          metadata: {
            type: 'qa_chunk',
            chunkId: result.id,
            documentId: result.metadata.documentId,
            chunkIndex: result.metadata.chunkIndex,
            searchMethod: 'hybrid'
          }
        }))
      };

    } catch (error) {
      console.error('❌ Smart QA failed:', error);
      return {
        answer: 'Sorry, I cannot answer this question. Please try rephrasing your question.',
        confidence: 0,
        sources: [],
        searchResults: []
      };
    }
  }

  /**
   * Document search
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
        LIMIT $limit
      `;

      const results = await neo4jManager.executeQuery(cypherQuery, {
        query: query.query,
        limit: neo4j.int(limit)
      });

      return results.map((result: any) => ({
        content: result.content,
        source: result.source,
        score: result.score,
        metadata: {
          type: 'document',
          filename: result.source,
          searchMethod: 'text'
        },
      }));
    } catch (error) {
      console.error('❌ Document search failed:', error);
      return [];
    }
  }

  /**
   * Get context
   */
  async getContext(query: string, limit: number = 3): Promise<SearchResult[]> {
    try {
      const limitInt = Math.floor(limit);
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
        limit: neo4j.int(limitInt),
      });

      return results.map((result: any) => ({
        content: result.content,
        source: result.source,
        score: result.score,
        metadata: {
          type: 'context',
          chunkIndex: result.chunkIndex,
          documentTitle: result.documentTitle,
          searchMethod: 'text'
        },
      }));
    } catch (error) {
      console.error('❌ Failed to get context:', error);
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
   * Get chunk content
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
      console.error('❌ Failed to get chunk content:', error);
      return null;
    }
  }

  /**
   * Resolve search strategy
   */
  private resolveStrategy(strategy: string | SearchStrategy | undefined): SearchStrategy {
    if (typeof strategy === 'string') {
      const foundStrategy = this.searchStrategies.get(strategy);
      if (foundStrategy) {
        return foundStrategy;
      }
      console.warn(`⚠️ Strategy "${strategy}" not found, using default strategy`);
    } else if (strategy && typeof strategy === 'object') {
      return strategy;
    }
    
    // Default to vector search strategy
    return this.searchStrategies.get('vector-with-context')!;
  }

  /**
   * Perform vector search
   */
  private async performVectorSearch(query: SearchQuery, options: any = {}): Promise<SearchResult[]> {
    // Use searchWithContext if adjacent chunks are requested
    const searchMethod = options.includeAdjacentChunks ? 
      this.vectorSearchService.searchWithContext.bind(this.vectorSearchService) : 
      this.vectorSearchService.search.bind(this.vectorSearchService);
    
    // Calculate appropriate topK for context expansion
    // Strategy options should take precedence over query limit for context expansion
    let topK = Math.floor(options.topK || 10);
    if (options.includeAdjacentChunks) {
      // For context expansion, use strategy's topK, not query limit
      topK = Math.max(topK, 8); // Ensure sufficient initial results for context expansion
      console.log(`   🔍 Context expansion enabled, using strategy topK: ${topK} (ignoring query limit: ${query.limit})`);
    } else {
      // For regular search, use query limit if available
      topK = Math.floor(query.limit || topK);
      console.log(`   🔍 Regular search, using topK: ${topK}`);
    }
    
    const vectorResults = await searchMethod(query.query, {
      topK: topK,
      threshold: options.threshold || 0.5,
      includeAdjacentChunks: options.includeAdjacentChunks || false,
      contextWindow: Math.floor(options.contextWindow || 2)
    });

    // Add safety check, filter out invalid results
    const validResults = vectorResults.filter((result: any) => 
      result && 
      result.text && 
      typeof result.text === 'string' && 
      result.text.trim().length > 0 &&
      result.score !== undefined &&
      result.metadata
    );

    console.log(`   🔍 Vector search result validation: ${vectorResults.length} → ${validResults.length} valid results`);
    console.log(`   📊 Context expansion: ${options.includeAdjacentChunks ? 'enabled' : 'disabled'}, initial topK: ${topK}`);

    return validResults.map((result: any) => ({
      content: result.text,
      source: result.metadata?.fileName || result.id || 'unknown',
      score: result.score || 0,
      metadata: {
        type: 'vector_chunk',
        chunkId: result.id || 'unknown',
        documentId: result.metadata?.documentId || 'unknown',
        chunkIndex: result.metadata?.chunkIndex || 0,
        searchMethod: 'vector'
      }
    }));
  }

  /**
   * Perform text search
   */
  private async performTextSearch(query: SearchQuery, options: any = {}): Promise<SearchResult[]> {
    const limit = Math.floor(options.limit || query.limit || 10);
    const cypherQuery = `
      MATCH (c:__Chunk__)
      WHERE c.text CONTAINS $query
      WITH c, 
           toLower(c.text) as lowerText,
           toLower($query) as lowerQuery
      RETURN c.text as content, 
             c.id as source, 
             CASE 
               WHEN lowerText CONTAINS lowerQuery THEN 0.8
               ELSE 0.3
             END as score
      ORDER BY score DESC, c.chunk_index ASC
      LIMIT $limit
    `;
    
    const results = await neo4jManager.executeQuery(cypherQuery, {
      query: query.query,
      limit: neo4j.int(limit)
    });

    // Add safety check, filter out invalid results
    const validResults = results.filter((result: any) => 
      result && 
      result.content && 
      typeof result.content === 'string' && 
      result.content.trim().length > 0 &&
      result.source &&
      result.score !== undefined
    );

    console.log(`   🔍 Text search result validation: ${results.length} → ${validResults.length} valid results`);

    return validResults.map((result: any) => ({
      content: result.content,
      source: result.source || 'unknown',
      score: result.score || 0,
      metadata: {
        type: 'text_chunk',
        chunkId: result.source || 'unknown',
        searchMethod: 'text'
      },
    }));
  }

  /**
   * Optimize search results
   */
  private optimizeResults(results: SearchResult[], limit: number): SearchResult[] {
    // 1. Filter out invalid results (ensure content field exists)
    const validResults = results.filter(result => 
      result && 
      result.content && 
      typeof result.content === 'string' && 
      result.content.trim().length > 0
    );
    
    if (validResults.length === 0) {
      console.log('   ⚠️ No valid results to optimize');
      return [];
    }
    
    console.log(`   📊 Filter invalid results: ${results.length} → ${validResults.length}`);
    
    // 2. Normalize scores
    const normalizedResults = validResults.map(result => ({
      ...result,
      normalizedScore: this.normalizeScore(result.score)
    }));
    
    // Add score debug information
    console.log(`   📊 Score distribution:`, normalizedResults.map(r => ({
      originalScore: r.score,
      normalizedScore: (r as any).normalizedScore,
      content: r.content.substring(0, 50) + '...'
    })));
    
    // 3. Sort by normalized score
    normalizedResults.sort((a, b) => b.normalizedScore - a.normalizedScore);
    
    // 4. Deduplication
    const seen = new Set<string>();
    const uniqueResults: SearchResult[] = [];
    
    for (const result of normalizedResults) {
      // Safely create deduplication key
      const contentPreview = result.content ? result.content.substring(0, 100) : '';
      const key = `${result.source || 'unknown'}_${contentPreview}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
      
      // Don't break early - let deduplication complete to preserve context
      // if (uniqueResults.length >= limit) break;
    }

    // 5. Quality filtering - lower threshold because text search scores may be low
    const qualityThreshold = 0.01; // Reduced from 0.1 to 0.01
    const filteredResults = uniqueResults.filter(result => 
      (result as any).normalizedScore >= qualityThreshold
    );

    // 6. Apply limit after all processing is complete
    const finalResults = filteredResults.slice(0, limit);

    console.log(`   📊 Optimization: ${validResults.length} → ${uniqueResults.length} → ${filteredResults.length} → ${finalResults.length}`);
    console.log(`   🔍 Quality threshold: ${qualityThreshold}, final limit: ${limit}`);
    
    return finalResults;
  }

  /**
   * Normalize score
   */
  private normalizeScore(score: any): number {
    if (typeof score === 'number') {
      return Math.max(0, Math.min(1, score));
    }
    
    if (typeof score === 'object' && score !== null) {
      if (score.low !== undefined) {
        return Math.max(0, Math.min(1, score.low / 100));
      }
      if (score.high !== undefined) {
        return Math.max(0, Math.min(1, score.high / 100));
      }
    }
    
    return 0.5;
  }
}

export default UnifiedSearch; 