import { AgentMessage, AgentSession, SearchQuery } from '../models/types';
import LocalSearch from '../search/local-search';

export abstract class BaseAgent {
  protected localSearch: LocalSearch;
  protected sessions: Map<string, AgentSession> = new Map();

  constructor() {
    this.localSearch = new LocalSearch();
  }

  /**
   * Process user query
   */
  async processQuery(sessionId: string, message: string): Promise<string> {
    try {
      // Get or create session
      const session = this.getOrCreateSession(sessionId);
      
      // Add user message
      this.addMessage(session, 'user', message);
      
      // Smart query processing
      const searchResults = await this.smartSearch(message);
      
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
   * Smart search - extract keywords and perform multi-round search
   */
  private async smartSearch(message: string): Promise<any[]> {
    // 1. First try original query
    let results = await this.localSearch.hybridSearch({
      query: message,
      limit: 5,
    });

    // 2. If no results found, extract keywords and retry
    if (results.length === 0) {
      const keywords = this.extractKeywords(message);
      console.log(`🔍 Extracted keywords: ${keywords.join(', ')}`);
      
      for (const keyword of keywords) {
        if (keyword.length > 1) { // Ignore single character keywords
          const keywordResults = await this.localSearch.hybridSearch({
            query: keyword,
            limit: 3,
          });
          results = results.concat(keywordResults);
        }
      }
    }

    // 3. Deduplicate and limit result count
    const seen = new Set();
    const uniqueResults: any[] = [];
    
    for (const result of results) {
      const key = `${result.source}_${result.content.substring(0, 100)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
      if (uniqueResults.length >= 5) break;
    }

    console.log(`📊 Smart search found ${uniqueResults.length} results`);
    return uniqueResults;
  }

  /**
   * Extract query keywords
   */
  private extractKeywords(message: string): string[] {
    // Simple keyword extraction logic
    const stopWords = new Set([
      'what', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
    ]);

    // Remove punctuation and tokenize
    const words = message
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep Chinese, English, numbers and spaces
      .split(/\s+/)
      .filter(word => word.length > 0 && !stopWords.has(word.toLowerCase()));

    // For Chinese, further tokenization
    const chineseWords: string[] = [];
    words.forEach(word => {
      if (/[\u4e00-\u9fff]/.test(word)) {
        // Simple Chinese tokenization: split by character, keep combinations of 2+ characters
        for (let i = 0; i < word.length - 1; i++) {
          for (let j = i + 2; j <= word.length; j++) {
            const segment = word.substring(i, j);
            if (segment.length >= 2) {
              chineseWords.push(segment);
            }
          }
        }
      } else {
        chineseWords.push(word);
      }
    });

    return [...new Set(chineseWords)]; // Deduplicate
  }

  /**
   * Generate answer (subclasses must implement)
   */
  protected abstract generateAnswer(
    query: string, 
    searchResults: any[], 
    session: AgentSession
  ): Promise<string>;

  /**
   * Get or create session
   */
  protected getOrCreateSession(sessionId: string): AgentSession {
    if (!this.sessions.has(sessionId)) {
      const session: AgentSession = {
        id: sessionId,
        messages: [],
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.sessions.set(sessionId, session);
    }
    
    const session = this.sessions.get(sessionId)!;
    session.updated_at = new Date();
    return session;
  }

  /**
   * Add message to session
   */
  protected addMessage(session: AgentSession, role: 'user' | 'assistant', content: string): void {
    const message: AgentMessage = {
      role,
      content,
      timestamp: new Date(),
    };
    
    session.messages.push(message);
    session.updated_at = new Date();
  }

  /**
   * Get session history
   */
  getSessionHistory(sessionId: string): AgentMessage[] {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : [];
  }

  /**
   * Clear session
   */
  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }
}

export default BaseAgent; 