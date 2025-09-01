import { GeminiEmbeddingModel } from './vector-index/gemini-embedding-model';
import { getEmbeddingConfig } from '../config/unified-config';

// Redefine EmbeddingModel interface
export interface EmbeddingModel {
  /**
   * Generate embedding vector for single text
   * @param text Input text
   * @returns Embedding vector array
   */
  embedQuery(text: string): Promise<number[]>;
  
  /**
   * Generate embedding vectors for multiple texts in batch
   * @param texts Input text array
   * @returns Array of embedding vector arrays
   */
  embedDocuments(texts: string[]): Promise<number[][]>;
  
  /**
   * Embedding vector dimension
   */
  embeddingSize?: number;
}

export interface EmbeddingConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface EmbeddingCache {
  [key: string]: {
    embedding: number[];
    timestamp: number;
    ttl: number;
  };
}

export class EmbeddingManager {
  private static instance: EmbeddingManager;
  private embeddingModel: EmbeddingModel;
  private config: EmbeddingConfig;
  private cache: EmbeddingCache = {};
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24-hour cache

  private constructor() {
    const unifiedEmbeddingConfig = getEmbeddingConfig();
    
    this.config = {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: unifiedEmbeddingConfig.model,
      baseURL: process.env.GEMINI_BASE_URL,
      timeout: unifiedEmbeddingConfig.timeout,
      retryAttempts: unifiedEmbeddingConfig.retryAttempts,
      retryDelay: unifiedEmbeddingConfig.retryDelay,
    };

    this.embeddingModel = new GeminiEmbeddingModel({
      apiKey: this.config.apiKey,
      model: this.config.model,
      baseURL: this.config.baseURL,
    });

    console.log('🔧 EmbeddingManager initialized');
    console.log(`   📊 Model: ${this.config.model}`);
    console.log(`   🔑 API Key: ${this.config.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EmbeddingManager {
    if (!EmbeddingManager.instance) {
      EmbeddingManager.instance = new EmbeddingManager();
    }
    return EmbeddingManager.instance;
  }

  /**
   * Get embedding model instance
   */
  public getEmbeddingModel(): EmbeddingModel {
    return this.embeddingModel;
  }

  /**
   * Get configuration
   */
  public getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize embedding model
    this.embeddingModel = new GeminiEmbeddingModel({
      apiKey: this.config.apiKey,
      model: this.config.model,
      baseURL: this.config.baseURL,
    });
    
    console.log('🔄 EmbeddingManager configuration updated');
  }

  /**
   * Generate embedding for a single text (with caching and retry)
   */
  public async embedQuery(text: string): Promise<number[]> {
    const cacheKey = this.generateCacheKey(text);
    
    // Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`   💾 Using cached embedding for text (${text.substring(0, 50)}...)`);
      return cached;
    }

    // Generate embedding (with retry)
    const embedding = await this.embedWithRetry(text);
    
    // Store in cache
    this.setCache(cacheKey, embedding);
    
    return embedding;
  }

  /**
   * Batch generate embeddings for texts
   */
  public async embedDocuments(texts: string[]): Promise<number[][]> {
    console.log(`   🔄 Generating embeddings for ${texts.length} documents`);
    
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.generateCacheKey(texts[i]);
      const cached = this.getFromCache(cacheKey);
      
      if (cached) {
        results[i] = cached;
        console.log(`   💾 Using cached embedding for document ${i + 1}`);
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      console.log(`   🔄 Generating ${uncachedTexts.length} new embeddings`);
      const newEmbeddings = await this.embeddingModel.embedDocuments(uncachedTexts);
      
      // Put results back to correct positions
      for (let i = 0; i < uncachedIndices.length; i++) {
        const originalIndex = uncachedIndices[i];
        const embedding = newEmbeddings[i];
        
        results[originalIndex] = embedding;
        
        // Store in cache
        const cacheKey = this.generateCacheKey(uncachedTexts[i]);
        this.setCache(cacheKey, embedding);
      }
    }

    return results;
  }

  /**
   * Generate embedding with retry mechanism
   */
  private async embedWithRetry(text: string, attempt: number = 1): Promise<number[]> {
    try {
      console.log(`   🔄 Generating embedding (attempt ${attempt}/${this.config.retryAttempts || 3})`);
      return await this.embeddingModel.embedQuery(text);
    } catch (error) {
      if (attempt < (this.config.retryAttempts || 3)) {
        console.warn(`   ⚠️ Embedding generation failed (attempt ${attempt}), retrying in ${this.config.retryDelay || 1000}ms...`);
        await this.delay(this.config.retryDelay || 1000);
        return this.embedWithRetry(text, attempt + 1);
      } else {
        console.error(`   ❌ Embedding generation failed after ${this.config.retryAttempts || 3} attempts:`, error);
        throw error;
      }
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(text: string): string {
    return `embedding:${Buffer.from(text).toString('base64').substring(0, 32)}`;
  }

  /**
   * Get embedding from cache
   */
  private getFromCache(key: string): number[] | null {
    const cached = this.cache[key];
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.embedding;
    }
    
    // Clean expired cache
    if (cached) {
      delete this.cache[key];
    }
    
    return null;
  }

  /**
   * Set cache
   */
  private setCache(key: string, embedding: number[]): void {
    this.cache[key] = {
      embedding,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    };
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache = {};
    console.log('🧹 Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache),
    };
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const testText = 'health check';
      const embedding = await this.embedQuery(testText);
      
      return {
        status: 'healthy',
        details: {
          model: this.config.model,
          embeddingSize: embedding.length,
          cacheSize: Object.keys(this.cache).length,
          apiKeyConfigured: !!this.config.apiKey,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          model: this.config.model,
          apiKeyConfigured: !!this.config.apiKey,
        },
      };
    }
  }
}

// Export singleton instance
export const embeddingManager = EmbeddingManager.getInstance(); 