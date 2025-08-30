import { geminiClient, ANSWER_GENERATION_PROMPT, STREAM_ANSWER_PROMPT, GEMINI_CONFIG } from '../config/gemini';
import { SearchResult } from '../models/types';

export interface AnswerGenerationRequest {
  question: string;
  searchResults: SearchResult[];
  responseType?: string;
}

export interface AnswerGenerationResponse {
  answer: string;
  references: string[];
  metadata: {
    model: string;
    tokensUsed: number;
    processingTime: number;
  };
}

export class GeminiService {
  private model = geminiClient.getGenerativeModel({ 
    model: GEMINI_CONFIG.model,
    generationConfig: {
      temperature: GEMINI_CONFIG.temperature,
      maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
    }
  });

  constructor() {
    // Add debug info
    console.log('🔑 GeminiService initializing...');
    console.log('📝 API key length:', GEMINI_CONFIG.apiKey ? GEMINI_CONFIG.apiKey.length : 0);
    console.log('📝 API key prefix:', GEMINI_CONFIG.apiKey ? GEMINI_CONFIG.apiKey.substring(0, 10) + '...' : 'Not configured');
    console.log('🤖 Model name:', GEMINI_CONFIG.model);
  }

  /**
   * Generate AI answer
   */
  async generateAnswer(request: AnswerGenerationRequest): Promise<AnswerGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Build context
      const context = this.buildContext(request.searchResults);
      
      // Build prompt
      const prompt = ANSWER_GENERATION_PROMPT + `
      
---Search Results--- 
${context}

Question:
${request.question}

Please answer the question based on the search results above:`;

      // Generate answer
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text();
      
      // Extract references
      const references = this.extractReferences(answer);
      
      // Clean answer content (remove reference part)
      const cleanAnswer = this.cleanAnswer(answer);
      
      const processingTime = Date.now() - startTime;
      
      return {
        answer: cleanAnswer,
        references,
        metadata: {
          model: GEMINI_CONFIG.model,
          tokensUsed: 0, // Gemini API currently doesn't provide token count
          processingTime,
        }
      };
      
    } catch (error) {
      console.error('❌ Gemini answer generation failed:', error);
      throw new Error(`Answer generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stream AI answer generation
   */
  async *generateStreamAnswer(request: AnswerGenerationRequest): AsyncGenerator<string> {
    try {
      // Build context
      const context = this.buildContext(request.searchResults);
      
      // Build streaming prompt
      const prompt = STREAM_ANSWER_PROMPT
        .replace('{question}', request.question)
        .replace('{context}', context);

      // Stream generation
      const result = await this.model.generateContentStream(prompt);
      
      let fullAnswer = '';
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullAnswer += chunkText;
        yield chunkText;
      }
      
      // Add reference data after streaming output completes
      const references = this.extractReferences(fullAnswer);
      const cleanAnswer = this.cleanAnswer(fullAnswer);
      
      if (references.length > 0) {
        yield '\n\n### Reference Data\n';
        yield `{{'data': {{'Chunks':[${references.join(',')}] }} }}`;
      }
      
    } catch (error) {
      console.error('❌ Gemini streaming answer generation failed:', error);
      yield `\n\n**Error occurred while generating answer**: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Build context from search results
   */
  private buildContext(searchResults: SearchResult[]): string {
    if (searchResults.length === 0) {
      return 'No relevant information found';
    }

    return searchResults.map((result, index) => {
      const content = result.content.length > 300 
        ? result.content.substring(0, 300) + '...' 
        : result.content;
      
      return `**Fragment ${index + 1}** (ID: ${result.source}, Relevance: ${result.score})
Content: ${content}

---`;
    }).join('\n');
  }

  /**
   * Extract reference IDs from answer
   */
  private extractReferences(answer: string): string[] {
    const references: string[] = [];
    
    // Match reference format
    const referencePattern = /Chunks':\['([^']+)'\]/g;
    let match;
    
    while ((match = referencePattern.exec(answer)) !== null) {
      references.push(match[1]);
    }
    
    return references;
  }

  /**
   * Clean answer content, remove reference part
   */
  private cleanAnswer(answer: string): string {
    // Remove reference data part
    const cleanAnswer = answer.replace(/\n\n### Reference Data[\s\S]*$/, '');
    return cleanAnswer.trim();
  }

  /**
   * Validate API key
   */
  async validateApiKey(): Promise<boolean> {
    try {
      if (!GEMINI_CONFIG.apiKey) {
        return false;
      }
      
      // Try to generate simple test content
      const result = await this.model.generateContent('Hello');
      await result.response;
      return true;
    } catch (error) {
      console.error('❌ Gemini API key validation failed:', error);
      return false;
    }
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      name: GEMINI_CONFIG.model,
      temperature: GEMINI_CONFIG.temperature,
      maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
    };
  }
}

export default GeminiService; 