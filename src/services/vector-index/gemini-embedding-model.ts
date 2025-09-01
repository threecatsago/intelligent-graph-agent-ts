import { EmbeddingModel } from '../embedding-manager';

export interface GeminiEmbeddingConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
}

export class GeminiEmbeddingModel implements EmbeddingModel {
  private config: GeminiEmbeddingConfig;
  public embeddingSize: number = 768; // Gemini embedding-001 dimensions

  constructor(config: GeminiEmbeddingConfig) {
    this.config = {
      maxRetries: 3,
      timeout: 30000,
      ...config
    };
    
    // Set correct dimensions based on model
    this.setEmbeddingSize();
  }

  /**
   * Set embedding vector dimensions based on model
   */
  private setEmbeddingSize(): void {
    const model = this.config.model.toLowerCase();
    
    if (model.includes('embedding-001')) {
      this.embeddingSize = 768;
    } else if (model.includes('embedding-002')) {
      this.embeddingSize = 768;
    } else {
      // Default dimensions
      this.embeddingSize = 768;
    }
  }

  /**
   * Calculate embedding vector for a single text
   */
  async embedQuery(text: string): Promise<number[]> {
    try {
      const response = await this.callGeminiEmbeddingAPI([text]);
      return response[0];
    } catch (error) {
      console.error('❌ Failed to calculate single text embedding:', error);
      throw error;
    }
  }

  /**
   * Batch calculate embedding vectors for multiple texts
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      return await this.callGeminiEmbeddingAPI(texts);
    } catch (error) {
      console.error('❌ Failed to batch calculate text embeddings:', error);
      throw error;
    }
  }

  /**
   * Call Gemini embedding API
   */
  private async callGeminiEmbeddingAPI(texts: string[]): Promise<number[][]> {
    const { apiKey, model, baseURL, maxRetries = 3, timeout = 30000 } = this.config;
    
    // Validate input
    if (!texts || texts.length === 0) {
      throw new Error('Text list cannot be empty');
    }
    
    if (!apiKey) {
      throw new Error('Gemini API key not set');
    }
    
    // Filter empty texts
    const validTexts = texts.filter(text => text && text.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid text content');
    }
    
    // Retry logic
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.makeAPIRequest(validTexts, model, baseURL, timeout);
        
        if (response && response.embeddings && Array.isArray(response.embeddings)) {
          return response.embeddings.map((item: any) => item.values);
        } else {
          throw new Error('Invalid API response format');
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${maxRetries - attempt} seconds:`, lastError.message);
          await this.delay(1000 * attempt); // Incremental delay
        }
      }
    }
    
    throw lastError || new Error('All retries failed');
  }

  /**
   * Send API request
   */
  private async makeAPIRequest(
    texts: string[],
    model: string,
    baseURL?: string,
    timeout: number = 30000
  ): Promise<any> {
    const baseApiUrl = baseURL || 'https://generativelanguage.googleapis.com/v1beta';
    const apiUrl = `${baseApiUrl}/models/${model}:embedContent`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Gemini API needs to call each text separately
      const embeddings = [];
      
      for (const text of texts) {
        const requestBody = {
          content: {
            parts: [
              {
                text: text
              }
            ]
          }
        };
        
        const response = await fetch(`${apiUrl}?key=${this.config.apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        embeddings.push(result);
      }
      
      clearTimeout(timeoutId);
      
      // Format response
      return {
        embeddings: embeddings.map((item: any) => ({
          values: item.embedding.values || []
        }))
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout (${timeout}ms)`);
        }
        throw error;
      }
      
      throw new Error('Network request failed');
    }
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    const { apiKey, model } = this.config;
    
    if (!apiKey || apiKey.trim().length === 0) {
      console.error('❌ Gemini API key not set');
      return false;
    }
    
    if (!model || model.trim().length === 0) {
      console.error('❌ Gemini model name not set');
      return false;
    }
    
    return true;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.validateConfig()) {
        return false;
      }
      
      const testText = 'Hello, world!';
      const embedding = await this.embedQuery(testText);
      
      if (embedding && Array.isArray(embedding) && embedding.length === this.embeddingSize) {
        console.log('✅ Gemini embedding model connection test successful');
        return true;
      } else {
        console.error('❌ Gemini embedding model connection test failed: response format error');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Gemini embedding model connection test failed:', error);
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): { name: string; dimensions: number; maxTokens: number } {
    const { model } = this.config;
    
    if (model.includes('embedding-001')) {
      return { name: model, dimensions: this.embeddingSize, maxTokens: 2048 };
    } else if (model.includes('embedding-002')) {
      return { name: model, dimensions: this.embeddingSize, maxTokens: 2048 };
    }
    return { name: model, dimensions: this.embeddingSize, maxTokens: 2048 };
  }
} 