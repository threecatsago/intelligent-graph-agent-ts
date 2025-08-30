import { Router, Request, Response } from 'express';
import LocalSearch from '../../search/local-search';

const router = Router();
const localSearch = new LocalSearch();

// Search text chunks
router.post('/chunks', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    const results = await localSearch.searchChunks({ query, limit });
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'chunks',
      },
    });
  } catch (error) {
    console.error('❌ Failed to search text chunks:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while searching text chunks',
    });
  }
});

// Search documents
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    const results = await localSearch.searchDocuments({ query, limit });
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'documents',
      },
    });
  } catch (error) {
    console.error('❌ Failed to search documents:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while searching documents',
    });
  }
});

// Hybrid search
router.post('/hybrid', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    const results = await localSearch.hybridSearch({ query, limit });
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'hybrid',
      },
    });
  } catch (error) {
    console.error('❌ Hybrid search failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during hybrid search',
    });
  }
});

// Get context
router.post('/context', async (req: Request, res: Response) => {
  try {
    const { query, limit = 3 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query content cannot be empty',
      });
    }

    const results = await localSearch.getContext(query, limit);
    
    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
        type: 'context',
      },
    });
  } catch (error) {
    console.error('❌ Failed to get context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting context',
    });
  }
});

// Get document content
router.get('/document/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const content = await localSearch.getDocumentContent(documentId);
    
    if (!content) {
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
        length: content.length,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get document content:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting document content',
    });
  }
});

// Get chunk content
router.get('/chunk/:chunkId', async (req: Request, res: Response) => {
  try {
    const { chunkId } = req.params;
    const content = await localSearch.getChunkContent(chunkId);
    
    if (!content) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Text chunk does not exist',
      });
    }
    
    res.json({
      success: true,
      data: {
        chunkId,
        content,
        length: content.length,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get chunk content:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting chunk content',
    });
  }
});

export { router as searchRouter }; 