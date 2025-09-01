import { Router, Request, Response } from 'express';
import UnifiedSearch, { SearchStrategy, UnifiedSearchOptions } from '../../search/unified-search';
import { embeddingManager } from '../../services/embedding-manager';

const router = Router();
// Use singleton instance
const unifiedSearch = UnifiedSearch.getInstance();

/**
 * EmbeddingManager management interface
 */
router.get('/embedding/health', async (req: Request, res: Response) => {
  try {
    const health = await embeddingManager.healthCheck();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('❌ Embedding health check failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Embedding health check failed'
    });
  }
});

router.get('/embedding/config', (req: Request, res: Response) => {
  try {
    const config = embeddingManager.getConfig();
    res.json({
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey ? '***configured***' : 'not configured'
      }
    });
  } catch (error) {
    console.error('❌ Get embedding config failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get embedding configuration'
    });
  }
});

router.put('/embedding/config', (req: Request, res: Response) => {
  try {
    const { apiKey, model, baseURL, timeout, retryAttempts, retryDelay } = req.body;
    
    embeddingManager.updateConfig({
      apiKey,
      model,
      baseURL,
      timeout,
      retryAttempts,
      retryDelay
    });
    
    res.json({
      success: true,
      message: 'Embedding configuration updated successfully'
    });
  } catch (error) {
    console.error('❌ Update embedding config failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update embedding configuration'
    });
  }
});

router.get('/embedding/cache', (req: Request, res: Response) => {
  try {
    const stats = embeddingManager.getCacheStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Get embedding cache failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get embedding cache statistics'
    });
  }
});

router.delete('/embedding/cache', (req: Request, res: Response) => {
  try {
    embeddingManager.clearCache();
    res.json({
      success: true,
      message: 'Embedding cache cleared successfully'
    });
  } catch (error) {
    console.error('❌ Clear embedding cache failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear embedding cache'
    });
  }
});

/**
 * Get all available search strategies
 */
router.get('/strategies', (req: Request, res: Response) => {
  try {
    const strategies = unifiedSearch.getAvailableStrategies();
    res.json({
      success: true,
      data: {
        strategies,
        count: strategies.length,
        defaultStrategy: 'hybrid-balanced'
      }
    });
  } catch (error) {
    console.error('❌ Failed to get search strategies:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting search strategies'
    });
  }
});

/**
 * Unified search interface - replaces original /chunks, /hybrid interfaces
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { 
      query, 
      limit = 10, 
      strategy = 'hybrid-balanced',
      options = {} 
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    console.log(`🔍 Unified search request: "${query}" (strategy: ${strategy})`);

    const searchOptions: UnifiedSearchOptions = {
      strategy,
      fallbackToText: options.fallbackToText !== false,
      ...options
    };

    const results = await unifiedSearch.search({ query, limit }, searchOptions);
    
    // Get used strategy information
    const strategyInfo = unifiedSearch.getStrategy(strategy);
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        strategy: {
          name: strategyInfo?.name || strategy,
          description: strategyInfo?.description || 'Custom strategy'
        },
        metadata: {
          vectorResults: results.filter(r => r.metadata?.searchMethod === 'vector').length,
          textResults: results.filter(r => r.metadata?.searchMethod === 'text').length,
          processingTime: Date.now(),
          searchMethod: 'unified'
        }
      },
    });
  } catch (error) {
    console.error('❌ Unified search failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during search',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Smart QA interface
 */
router.post('/qa', async (req: Request, res: Response) => {
  try {
    const { question, options = {} } = req.body;

    if (!question) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Question content cannot be empty',
      });
    }

    console.log(`🤖 Smart QA request: "${question}"`);

    const qaOptions: UnifiedSearchOptions = {
      enableQA: true,
      qaOptions: {
        topK: options.topK || 5,
        threshold: options.threshold || 0.5
      }
    };

    const result = await unifiedSearch.askQuestion(question, qaOptions);
    
    res.json({
      success: true,
      data: {
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        searchResults: result.searchResults,
        count: result.searchResults.length,
        type: 'smart_qa',
        metadata: {
          processingTime: Date.now(),
          searchMethod: 'unified_qa'
        }
      },
    });
  } catch (error) {
    console.error('❌ Smart QA failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during QA process'
    });
  }
});

/**
 * Document search interface
 */
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    console.log(`📄 Document search request: "${query}"`);

    const results = await unifiedSearch.searchDocuments({ query, limit });
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'documents',
        metadata: {
          searchMethod: 'text'
        }
      },
    });
  } catch (error) {
    console.error('❌ Document search failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during document search'
    });
  }
});

/**
 * Get context interface
 */
router.post('/context', async (req: Request, res: Response) => {
  try {
    const { query, limit = 3 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    console.log(`📋 Get context request: "${query}"`);

    const results = await unifiedSearch.getContext(query, limit);
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'context',
        metadata: {
          searchMethod: 'text'
        }
      },
    });
  } catch (error) {
    console.error('❌ Failed to get context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting context'
    });
  }
});

/**
 * Get document content interface
 */
router.get('/document/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    console.log(`📄 Get document content: ${documentId}`);

    const content = await unifiedSearch.getDocumentContent(documentId);
    
    if (content === null) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Document does not exist',
      });
    }
    
    res.json({
      success: true,
      data: {
        documentId,
        content,
        type: 'document_content'
      },
    });
  } catch (error) {
    console.error('❌ Failed to get document content:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting document content'
    });
  }
});

/**
 * Get chunk content interface
 */
router.get('/chunk/:chunkId', async (req: Request, res: Response) => {
  try {
    const { chunkId } = req.params;
    
    console.log(`📝 Get chunk content: ${chunkId}`);

    const content = await unifiedSearch.getChunkContent(chunkId);
    
    if (content === null) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chunk does not exist',
      });
    }
    
    res.json({
      success: true,
      data: {
        chunkId,
        content,
        type: 'chunk_content'
      },
    });
  } catch (error) {
    console.error('❌ Failed to get chunk content:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting chunk content'
    });
  }
});

/**
 * Search comparison interface - search using multiple strategies simultaneously
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, strategies = ['text-only', 'vector-only', 'hybrid-balanced'] } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    console.log(`🔍 Search comparison request: "${query}"`);

    // Execute searches with multiple strategies in parallel
    const comparisonResults = await Promise.all(
      strategies.map(async (strategy: string) => {
        try {
          const results = await unifiedSearch.search(
            { query, limit },
            { strategy, fallbackToText: false }
          );
          
          const strategyInfo = unifiedSearch.getStrategy(strategy);
          
          return {
            strategy: strategyInfo?.name || strategy,
            description: strategyInfo?.description || 'Custom strategy',
            results,
            count: results.length,
            metadata: {
              vectorResults: results.filter(r => r.metadata?.searchMethod === 'vector').length,
              textResults: results.filter(r => r.metadata?.searchMethod === 'text').length
            }
          };
        } catch (error) {
          console.warn(`⚠️ Strategy "${strategy}" search failed:`, error);
          return {
            strategy,
            description: 'Search failed',
            results: [],
            count: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        query,
        comparison: comparisonResults,
        metadata: {
          strategiesCount: strategies.length,
          timestamp: new Date().toISOString()
        }
      },
    });
  } catch (error) {
    console.error('❌ Search comparison failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during search comparison'
    });
  }
});

/**
 * Streaming QA interface
 */
router.post('/qa/stream', async (req: Request, res: Response) => {
  try {
    const { question, options = {} } = req.body;

    if (!question) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Question content cannot be empty',
      });
    }

    console.log(`🌊 Streaming QA request: "${question}"`);

    // Set streaming response headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // First perform search
    const searchResults = await unifiedSearch.search(
      { query: question, limit: options.topK || 5 },
      { strategy: 'hybrid-balanced' }
    );

    if (searchResults.length === 0) {
      res.write('Sorry, I could not find relevant information to answer your question.');
      res.end();
      return;
    }

    // Build context
    const context = searchResults.map((result, index) => 
      `**Fragment ${index + 1}** (Source: ${result.source})\n${result.content}\n---`
    ).join('\n');

    // Build prompt
    const prompt = `Answer the user's question based on the following search results:

Search results:
${context}

User question: ${question}

Please provide accurate and detailed answers based on the search results:`;

    // Here you can integrate streaming AI generation
    // For now, use simple streaming response
    res.write('Generating answer...\n\n');
    
    // Simulate streaming generation
    const answer = `Based on the search results, I'll answer your question: ${question}\n\n`;
    for (let i = 0; i < answer.length; i++) {
      res.write(answer[i]);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    res.write('\n\nReference sources:\n');
    searchResults.forEach((result, index) => {
      res.write(`${index + 1}. ${result.source}\n`);
    });

    res.end();

  } catch (error) {
    console.error('❌ Streaming QA failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during streaming QA'
    });
  }
});

export default router; 