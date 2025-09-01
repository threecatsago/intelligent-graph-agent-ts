import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getAppConfig } from '../config/unified-config';
import chatRouter from './routes/chat';
import unifiedSearchRouter from './routes/unified-search';
import { graphRouter } from './routes/graph';
import { uploadRouter } from './routes/upload';

export class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow inline styles and scripts
    }));
    
    // CORS middleware
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' ? false : true,
      credentials: true,
    }));

    // Parse JSON
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL encoded
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static file service
    this.app.use(express.static('public'));

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });

    // API routes
    this.app.use('/api/chat', chatRouter);
    this.app.use('/api/search', unifiedSearchRouter);
    this.app.use('/api/graph', graphRouter);
    this.app.use('/api/upload', uploadRouter);

    // Root path returns main page
    this.app.get('/', (req, res) => {
      res.sendFile('index.html', { root: 'public' });
    });

    // 404 handling
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handling
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Server error:', error);
      
      res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      });
    });
  }

  public listen(): void {
    const config = getAppConfig();
    this.app.listen(config.port, () => {
      console.log(`🚀 Server started successfully!`);
      console.log(`📍 Address: http://localhost:${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📊 Health check: http://localhost:${config.port}/health`);
    });
  }
}

export default App; 