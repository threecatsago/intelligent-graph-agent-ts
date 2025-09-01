import { embeddingManager } from './embedding-manager';
import { neo4jManager } from '../database/neo4j';
import GeminiService from './gemini-service';
import { VectorSearchService } from './vector-index/vector-search';
import { QAService } from './vector-index/qa-service';
import { SimpleAgent } from '../agents/simple-agent';

export interface ServiceConfig {
  enableLogging?: boolean;
  maxRetries?: number;
  timeout?: number;
}

export class ServiceManager {
  private static instance: ServiceManager;
  private config: ServiceConfig;
  
  // Service instances
  private _geminiService: GeminiService | null = null;
  private _vectorSearchService: VectorSearchService | null = null;
  private _qaService: QAService | null = null;
  private _agent: SimpleAgent | null = null;

  private constructor(config: ServiceConfig = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 30000,
    };

    if (this.config.enableLogging) {
      console.log('🔧 ServiceManager initialized');
      console.log(`   📊 Config:`, this.config);
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: ServiceConfig): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager(config);
    }
    return ServiceManager.instance;
  }

  /**
   * Get GeminiService instance (singleton)
   */
  public getGeminiService(): GeminiService {
    if (!this._geminiService) {
      this._geminiService = new GeminiService();
      if (this.config.enableLogging) {
        console.log('🔑 GeminiService instance created (singleton)');
      }
    }
    return this._geminiService;
  }

  /**
   * Get VectorSearchService instance (singleton)
   */
  public getVectorSearchService(): VectorSearchService {
    if (!this._vectorSearchService) {
      const embeddingModel = embeddingManager.getEmbeddingModel();
      this._vectorSearchService = new VectorSearchService(embeddingModel);
      if (this.config.enableLogging) {
        console.log('🔍 VectorSearchService instance created (singleton)');
      }
    }
    return this._vectorSearchService;
  }

  /**
   * Get QAService instance (singleton)
   */
  public getQAService(): QAService {
    if (!this._qaService) {
      const vectorSearchService = this.getVectorSearchService();
      const embeddingModel = embeddingManager.getEmbeddingModel();
      this._qaService = new QAService(vectorSearchService, embeddingModel);
      if (this.config.enableLogging) {
        console.log('🤖 QAService instance created (singleton)');
      }
    }
    return this._qaService;
  }

  /**
   * Get SimpleAgent instance (singleton)
   */
  public getAgent(): SimpleAgent {
    if (!this._agent) {
      this._agent = new SimpleAgent();
      if (this.config.enableLogging) {
        console.log('🤖 SimpleAgent instance created (singleton)');
      }
    }
    return this._agent;
  }

  /**
   * Get configuration
   */
  public getConfig(): ServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.config.enableLogging) {
      console.log('🔄 ServiceManager configuration updated');
    }
  }

  /**
   * Reset all service instances (for testing)
   */
  public reset(): void {
    this._geminiService = null;
    this._vectorSearchService = null;
    this._qaService = null;
    if (this.config.enableLogging) {
      console.log('🔄 ServiceManager instances reset');
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    services: {
      embeddingManager: boolean;
      neo4jManager: boolean;
      geminiService: boolean;
      vectorSearchService: boolean;
      qaService: boolean;
    };
    details: any;
  }> {
    try {
      const services = {
        embeddingManager: false,
        neo4jManager: false,
        geminiService: false,
        vectorSearchService: false,
        qaService: false,
      };

      // Check EmbeddingManager
      try {
        const embeddingHealth = await embeddingManager.healthCheck();
        services.embeddingManager = embeddingHealth.status === 'healthy';
      } catch (error) {
        console.warn('⚠️ EmbeddingManager health check failed:', error);
      }

      // Check Neo4jManager
      try {
        const neo4jHealth = await neo4jManager.healthCheck();
        services.neo4jManager = neo4jHealth;
      } catch (error) {
        console.warn('⚠️ Neo4jManager health check failed:', error);
      }

      // Check GeminiService
      try {
        const geminiService = this.getGeminiService();
        const isValid = await geminiService.validateApiKey();
        services.geminiService = isValid;
      } catch (error) {
        console.warn('⚠️ GeminiService health check failed:', error);
      }

      // Check VectorSearchService
      try {
        const vectorService = this.getVectorSearchService();
        // Simple availability check
        services.vectorSearchService = true;
      } catch (error) {
        console.warn('⚠️ VectorSearchService health check failed:', error);
      }

      // Check QAService
      try {
        const qaService = this.getQAService();
        // Simple availability check
        services.qaService = true;
      } catch (error) {
        console.warn('⚠️ QAService health check failed:', error);
      }

      const allHealthy = Object.values(services).every(healthy => healthy);
      
      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        services,
        details: {
          config: this.config,
          embeddingManagerConfig: embeddingManager.getConfig(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        services: {
          embeddingManager: false,
          neo4jManager: false,
          geminiService: false,
          vectorSearchService: false,
          qaService: false,
        },
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

  // Export singleton instance
export const serviceManager = ServiceManager.getInstance(); 