import { Router, Request, Response } from 'express';
import { neo4jManager } from '../../database/neo4j';
import KnowledgeGraphBuilder from '../../services/knowledge-graph-builder';

const router = Router();
const graphBuilder = new KnowledgeGraphBuilder();

// Build knowledge graph
router.post('/build', async (req: Request, res: Response) => {
  try {
    const { inputPath, rebuild = false } = req.body;

    if (!inputPath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Input path cannot be empty',
      });
    }

    console.log(`🏗️ Starting knowledge graph construction: ${inputPath}`);
    
    if (rebuild) {
      await graphBuilder.rebuildKnowledgeGraph(inputPath);
    } else {
      await graphBuilder.buildKnowledgeGraph(inputPath);
    }

    // Validate build result
    const isValid = await graphBuilder.validateBuild();
    
    res.json({
      success: true,
      data: {
        inputPath,
        rebuild,
        valid: isValid,
        message: 'Knowledge graph construction completed',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Knowledge graph construction failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during knowledge graph construction',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get database statistics
router.get('/stats', async (req: Request, res: Response) => {
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

    res.json({
      success: true,
      data: {
        nodeStats: stats,
        totalNodes: totalNodes[0]?.total || 0,
        totalRelationships: totalRelationships[0]?.total || 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Failed to get statistics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting statistics',
    });
  }
});

// Get graph structure
router.get('/structure', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;

    // Get document and chunk relationships
    const structure = await neo4jManager.executeQuery(`
      MATCH (d:__Document__)<-[:PART_OF]-(c:__Chunk__)
      RETURN d.title as document, d.filename as filename, 
             collect(c.chunk_index) as chunkIndices,
             count(c) as chunkCount
      ORDER BY d.filename
      LIMIT $limit
    `, { limit: parseInt(limit as string) });

    res.json({
      success: true,
      data: {
        structure,
        count: structure.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Failed to get graph structure:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred while getting graph structure',
    });
  }
});

// Clear database
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    console.log('🧹 Starting database cleanup...');
    
    await neo4jManager.executeWriteQuery(`
      MATCH (n)
      CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 25000 ROWS
    `);
    
    console.log('✅ Database cleanup completed');
    
    res.json({
      success: true,
      data: {
        message: 'Database cleanup completed',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error occurred during database cleanup',
    });
  }
});

// Health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isHealthy = await neo4jManager.healthCheck();
    
    if (isHealthy) {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          database: 'connected',
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Database connection abnormal',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Test document processing
router.post('/test-document-processing', async (req: Request, res: Response) => {
  try {
    const { inputPath } = req.body;
    
    if (!inputPath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Input path cannot be empty',
      });
    }

    console.log(`📄 Testing document processing: ${inputPath}`);
    
    const DocumentProcessor = require('../../services/document-processor').default;
    const processor = new DocumentProcessor();
    
    const documents = await processor.processDirectory(inputPath);
    
    res.json({
      success: true,
      data: {
        documentsCount: documents.length,
        documents: documents.map((doc: any) => ({
          filename: doc.filename,
          chunksCount: doc.chunks.length,
          contentLength: doc.content.length,
          metadata: doc.metadata
        }))
      },
    });
  } catch (error) {
    console.error('❌ Document processing test failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Document processing test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test constraint creation
router.post('/test-constraints', async (req: Request, res: Response) => {
  try {
    console.log('🔧 Testing constraint creation...');
    
    await neo4jManager.createConstraints();
    
    res.json({
      success: true,
      message: 'Constraint creation test successful',
    });
  } catch (error) {
    console.error('❌ Constraint creation test failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Constraint creation test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test index creation
router.post('/test-indexes', async (req: Request, res: Response) => {
  try {
    console.log('📊 Testing index creation...');
    
    await neo4jManager.createIndexes();
    
    res.json({
      success: true,
      message: 'Index creation test successful',
    });
  } catch (error) {
    console.error('❌ Index creation test failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Index creation test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test single document write
router.post('/test-write-document', async (req: Request, res: Response) => {
  try {
    const { inputPath } = req.body;
    
    if (!inputPath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Input path cannot be empty',
      });
    }

    console.log(`💾 Testing single document write: ${inputPath}`);
    
    const DocumentProcessor = require('../../services/document-processor').default;
    const GraphWriter = require('../../services/graph-writer').default;
    
    const processor = new DocumentProcessor();
    const writer = new GraphWriter();
    
    // Process only first document
    const documents = await processor.processDirectory(inputPath);
    if (documents.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No documents found to process',
      });
    }
    
    const firstDocument = documents[0];
    console.log(`📄 Processing document: ${firstDocument.filename}`);
    
    await writer.processAndWriteGraphDocuments([firstDocument]);
    
    res.json({
      success: true,
      data: {
        document: firstDocument.filename,
        chunksCount: firstDocument.chunks.length,
        message: 'Single document write test successful',
      },
    });
  } catch (error) {
    console.error('❌ Single document write test failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Single document write test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as graphRouter }; 