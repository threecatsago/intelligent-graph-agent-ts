import { Router, Request, Response } from 'express';
import { SimpleAgent } from '../../agents/simple-agent';
import { UnifiedSearch } from '../../search/unified-search';
import { serviceManager } from '../../services/service-manager';

const router = Router();
const agent = new SimpleAgent();
const unifiedSearch = UnifiedSearch.getInstance();

// Send message
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { message, sessionId = 'default', stream = false } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message content cannot be empty',
      });
    }

    console.log(`💬 Received message: ${message} (session: ${sessionId}, stream: ${stream})`);
    
    if (stream) {
      // Stream answer
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      // Use UnifiedSearch to perform a search once, avoiding duplicate searches
      const searchResults = await unifiedSearch.search({
        query: message,
        limit: 5
      }, { strategy: 'hybrid-vector-heavy' });
      
      const session = (serviceManager.getAgent() as any).getOrCreateSession(sessionId);
      
      try {
        const streamGenerator = await serviceManager.getAgent().generateStreamAnswer(message, searchResults, session);
        
        for await (const chunk of streamGenerator) {
          res.write(chunk);
        }
        
        res.end();
      } catch (error) {
        console.error('❌ Stream answer generation failed:', error);
        res.write(`\n\n**Error occurred while generating answer**: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.end();
      }
    } else {
      // Regular answer - using UnifiedSearch results
      const searchResults = await unifiedSearch.search({
        query: message,
        limit: 5
      }, { strategy: 'hybrid-vector-heavy' });
      
      const answer = await serviceManager.getAgent().processQueryWithResults(sessionId, message, searchResults);
      
      res.json({
        success: true,
        data: {
          answer,
          sessionId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error('❌ Failed to process message:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while processing message',
    });
  }
});

// Get session history
router.get('/history/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const history = serviceManager.getAgent().getSessionHistory(sessionId);
    
    res.json({
      success: true,
      data: {
        sessionId,
        messages: history,
        count: history.length,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get session history:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting session history',
    });
  }
});

// Clear session
router.delete('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = serviceManager.getAgent().clearSession(sessionId);
    
    res.json({
      success: true,
      data: {
        sessionId,
        cleared: success,
        message: success ? 'Session cleared' : 'Session does not exist',
      },
    });
  } catch (error) {
    console.error('❌ Failed to clear session:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while clearing session',
    });
  }
});

// Get search suggestions
router.post('/suggestions', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    const suggestions = await serviceManager.getAgent().getSearchSuggestions(query);
    
    res.json({
      success: true,
      data: {
        query,
        suggestions,
        count: suggestions.length,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get search suggestions:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting search suggestions',
    });
  }
});

// Get Gemini service status
router.get('/gemini/status', async (req: Request, res: Response) => {
  try {
    const status = await serviceManager.getAgent().getGeminiStatus();
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('❌ Failed to get Gemini status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting Gemini status',
    });
  }
});

export default router; 