import BaseAgent from './base-agent';
import { AgentSession } from '../models/types';
import { serviceManager } from '../services/service-manager';

export class SimpleAgent extends BaseAgent {
  private geminiService: any;

  constructor() {
    super();
    // Use ServiceManager to get GeminiService instance
    this.geminiService = serviceManager.getGeminiService();
  }

  /**
   * Generate AI answer
   */
  protected async generateAnswer(
    query: string, 
    searchResults: any[], 
    session: AgentSession
  ): Promise<string> {
    try {
      // If no search results, return default message
      if (searchResults.length === 0) {
        return 'Sorry, I could not find information related to your query. Please try using other keywords or provide more details.';
      }

      // Validate Gemini API key
      const isApiValid = await this.geminiService.validateApiKey();
      if (!isApiValid) {
        console.warn('⚠️ Gemini API key invalid, using fallback answer generation');
        return this.generateFallbackAnswer(query, searchResults);
      }

      // Use Gemini to generate AI answer
      const answerRequest = {
        question: query,
        searchResults: searchResults,
        responseType: 'concise'
      };

      const aiResponse = await this.geminiService.generateAnswer(answerRequest);
      
      console.log(`🤖 Gemini answer generation successful, used ${aiResponse.metadata.tokensUsed} tokens, took ${aiResponse.metadata.processingTime}ms`);
      
      return aiResponse.answer;
      
    } catch (error) {
      console.error('❌ AI answer generation failed, using fallback method:', error);
      return this.generateFallbackAnswer(query, searchResults);
    }
  }

  /**
   * Generate streaming AI answer
   */
  async generateStreamAnswer(
    query: string, 
    searchResults: any[], 
    session: AgentSession
  ): Promise<AsyncGenerator<string>> {
    try {
      // If no search results, return default message
      if (searchResults.length === 0) {
        const generator = async function* () {
          yield 'Sorry, I could not find information related to your query. Please try using other keywords or provide more details.';
        };
        return generator();
      }

      // Validate Gemini API key
      const isApiValid = await this.geminiService.validateApiKey();
      if (!isApiValid) {
        console.warn('⚠️ Gemini API key invalid, using fallback answer generation');
        const self = this;
        const generator = async function* () {
          yield self.generateFallbackAnswer(query, searchResults);
        };
        return generator();
      }

      // Use Gemini to generate streaming AI answer
      const answerRequest = {
        question: query,
        searchResults: searchResults,
        responseType: 'concise'
      };

      return this.geminiService.generateStreamAnswer(answerRequest);
      
    } catch (error) {
      console.error('❌ Streaming AI answer generation failed, using fallback method:', error);
      const self = this;
      const generator = async function* () {
        yield self.generateFallbackAnswer(query, searchResults);
      };
      return generator();
    }
  }

  /**
   * Process query with existing search results (avoid duplicate search)
   */
  async processQueryWithResults(sessionId: string, message: string, existingResults?: any[]): Promise<string> {
    try {
      // Get or create session
      const session = this.getOrCreateSession(sessionId);
      
      // Add user message
      this.addMessage(session, 'user', message);
      
      // Use existing results if available, otherwise perform smart search
      const searchResults = await this.smartSearchWithResults(message, existingResults);
      
      // Generate answer
      const answer = await this.generateAnswer(message, searchResults, session);
      
      // Add assistant message
      this.addMessage(session, 'assistant', answer);
      
      return answer;
      
    } catch (error) {
      console.error('❌ Query processing failed:', error);
      return 'Sorry, an error occurred while processing your query. Please try again later.';
    }
  }

  /**
   * Fallback answer generation method (when Gemini is unavailable)
   */
  private generateFallbackAnswer(query: string, searchResults: any[]): string {
    let answer = `Based on search results, I found the following relevant information:\n\n`;
    
    searchResults.forEach((result, index) => {
      const content = result.content.length > 200 
        ? result.content.substring(0, 200) + '...' 
        : result.content;
      
      answer += `${index + 1}. **Source**: ${result.source}\n`;
      answer += `**Content**: ${content}\n`;
      answer += `**Relevance**: ${result.score}\n\n`;
    });

    // Add summary and suggestions
    answer += `\n**Summary**: Above are the most relevant results found.`;
    answer += `\n\n**Suggestions**: If you need more detailed information, please tell me specific questions, or try using more precise keywords.`;

    return answer;
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(query: string): Promise<string[]> {
    try {
      // Get related documents based on query
      const searchQuery = {
        query,
        limit: 3,
      };
      
      const results = await this.unifiedSearch.searchDocuments(searchQuery);
      
      if (results.length === 0) {
        return ['Please try using more specific keywords', 'Check if spelling is correct'];
      }

      // Extract suggestions from results
      const suggestions: string[] = [];
      
      results.forEach(result => {
        const filename = result.source;
        if (filename.includes('.')) {
          const name = filename.split('.')[0];
          if (name.length > 3) {
            suggestions.push(`View more information about "${name}"`);
          }
        }
      });

      // Add general suggestions
      suggestions.push('Try using different keyword combinations');
      suggestions.push('Check for spelling errors');

      return suggestions.slice(0, 5);
    } catch (error) {
      console.error('❌ Failed to get search suggestions:', error);
      return ['Please try searching again'];
    }
  }

  /**
   * Get Gemini service status
   */
  async getGeminiStatus(): Promise<{
    isAvailable: boolean;
    modelInfo: any;
    lastError?: string;
  }> {
    try {
      const isAvailable = await this.geminiService.validateApiKey();
      const modelInfo = this.geminiService.getModelInfo();
      
      return {
        isAvailable,
        modelInfo,
      };
    } catch (error) {
      return {
        isAvailable: false,
        modelInfo: null,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export default SimpleAgent; 