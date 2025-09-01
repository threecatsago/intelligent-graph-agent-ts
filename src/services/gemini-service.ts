import { geminiClient, ANSWER_GENERATION_PROMPT, STREAM_ANSWER_PROMPT } from '../config/gemini';
import { SearchResult } from '../models/types';
import { getGeminiConfig } from '../config/unified-config';

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
  private model: any;
  private config: any;

  constructor() {
    // Use unified configuration
    this.config = getGeminiConfig();
    
    this.model = geminiClient.getGenerativeModel({ 
      model: this.config.model,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
      }
    });

    // Reduce duplicate log output
    console.log('🔑 GeminiService initialized');
    console.log(`   🤖 Model: ${this.config.model}`);
    console.log(`   🔑 API Key: ${this.config.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  }

  /**
   * Generate AI answer
   */
  async generateAnswer(request: AnswerGenerationRequest): Promise<AnswerGenerationResponse> {
    const startTime = Date.now();
    
    try {
      console.log('🤖 Gemini API call started...');
      console.log('📋 Request parameters:', {
        question: request.question,
        searchResultsCount: request.searchResults.length,
        responseType: request.responseType
      });
      
      // Build context
      const context = this.buildContext(request.searchResults);
      
      // Build prompt
      const prompt = ANSWER_GENERATION_PROMPT + `
      
---Search Results--- 
${context}

Question:
${request.question}

Please answer the question based on the search results above:`;

      console.log('📝 Complete prompt sent to Gemini:');
      console.log('─'.repeat(80));
      console.log(prompt);
      console.log('─'.repeat(80));
      
      console.log('📊 Prompt statistics:');
      console.log(`  - Total length: ${prompt.length} characters`);
      console.log(`  - Search results count: ${request.searchResults.length}`);
      console.log(`  - Question length: ${request.question.length} characters`);

      // Generate answer
      console.log('🚀 Calling Gemini API...');
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text();
      
      console.log('✅ Gemini API response successful!');
      console.log('📊 Response statistics:');
      console.log(`  - Response length: ${answer.length} characters`);
      console.log(`  - Response content preview: ${answer.substring(0, 200)}...`);
      
      // Extract references
      const references = this.extractReferences(answer);
      console.log(`🔗 Extracted ${references.length} references`);
      
      // Clean answer content (remove reference part)
      const cleanAnswer = this.cleanAnswer(answer);
      console.log(`🧹 Cleaned answer length: ${cleanAnswer.length} characters`);
      
      const processingTime = Date.now() - startTime;
      console.log(`⏱️ Total processing time: ${processingTime}ms`);
      
      return {
        answer: cleanAnswer,
        references,
        metadata: {
          model: this.config.model,
          tokensUsed: 0, // Gemini API currently doesn't provide token count
          processingTime,
        }
      };
      
    } catch (error) {
      console.error('❌ Gemini answer generation failed:', error);
      console.error('🔍 Error details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        request: {
          question: request.question,
          searchResultsCount: request.searchResults.length
        }
      });
      throw new Error(`Answer generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stream AI answer generation
   */
  async *generateStreamAnswer(request: AnswerGenerationRequest): AsyncGenerator<string> {
    try {
      console.log('🤖 Gemini streaming API call started...');
      console.log('📋 Streaming request parameters:', {
        question: request.question,
        searchResultsCount: request.searchResults.length,
        responseType: request.responseType
      });
      
      // Build context
      const context = this.buildContext(request.searchResults);
      
      // Build streaming prompt
      const prompt = STREAM_ANSWER_PROMPT
        .replace('{question}', request.question)
        .replace('{context}', context);

      console.log('📝 Streaming prompt sent to Gemini:');
      console.log('─'.repeat(80));
      console.log(prompt);
      console.log('─'.repeat(80));
      
      console.log('📊 Streaming prompt statistics:');
      console.log(`  - Total length: ${prompt.length} characters`);
      console.log(`  - Search results count: ${request.searchResults.length}`);
      console.log(`  - Question length: ${request.question.length} characters`);

      // Stream generation
      console.log('🚀 Starting streaming Gemini API call...');
      const result = await this.model.generateContentStream(prompt);
      
      let fullAnswer = '';
      let chunkCount = 0;
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullAnswer += chunkText;
        chunkCount++;
        
        if (chunkCount % 10 === 0) {
          console.log(`📦 Received ${chunkCount} chunks, current total length: ${fullAnswer.length} characters`);
        }
        
        yield chunkText;
      }
      
      console.log(`✅ Streaming generation completed! Total received ${chunkCount} chunks`);
      console.log(`📊 Final answer length: ${fullAnswer.length} characters`);
      console.log(`📝 Answer preview: ${fullAnswer.substring(0, 200)}...`);
      
      // Add reference data after streaming output completes
      const references = this.extractReferences(fullAnswer);
      const cleanAnswer = this.cleanAnswer(fullAnswer);
      
      console.log(`🔗 Extracted ${references.length} references`);
      console.log(`🧹 Cleaned answer length: ${cleanAnswer.length} characters`);
      
      if (references.length > 0) {
        yield '\n\n### Reference Data\n';
        yield `{{'data': {{'Chunks':[${references.join(',')}] }} }}`;
      }
      
    } catch (error) {
      console.error('❌ Gemini streaming answer generation failed:', error);
      console.error('🔍 Streaming error details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        request: {
          question: request.question,
          searchResultsCount: request.searchResults.length
        }
      });
      yield `\n\n**Error occurred while generating answer**: ${error instanceof Error ? error.message : String(error)}`;
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
      if (!this.config.apiKey) {
        return false;
      }
      
      // Test API key with simple content generation
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
      name: this.config.model,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
    };
  }
}

export default GeminiService; 