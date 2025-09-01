import { VectorSearchService, SearchResult } from './vector-search';
import { EmbeddingModel } from '../embedding-manager';
import { serviceManager } from '../service-manager';

export interface QARequest {
  question: string;
  searchOptions?: {
    topK?: number; 
    threshold?: number;
    useHybridSearch?: boolean;
  };
  answerOptions?: {
    maxLength?: number;
    includeSources?: boolean;
    format?: 'text' | 'structured';
  };
}

// Utility function to ensure topK is an integer
function ensureIntegerTopK(topK: number | undefined, defaultValue: number = 5): number {
  if (topK === undefined || topK === null) {
    return defaultValue;
  }
  return Math.floor(topK);
}

export interface QAAnswer {
  answer: string;
  confidence: number;
  sources: Array<{
    text: string;
    score: number;
    metadata: any;
  }>;
  searchResults: SearchResult[];
  processingTime: number;
}

export class QAService {
  private searchService: VectorSearchService;
  private embeddingModel: EmbeddingModel;
  private geminiService: any;

  constructor(searchService: VectorSearchService, embeddingModel: EmbeddingModel) {
    this.searchService = searchService;
    this.embeddingModel = embeddingModel;
    // Use ServiceManager to get GeminiService instance
    this.geminiService = serviceManager.getGeminiService();
  }

  /**
   * Execute smart QA
   */
  async ask(request: QARequest): Promise<QAAnswer> {
    const startTime = Date.now();
    
    try {
      console.log(`🤖 Smart QA: "${request.question}"`);
      console.log('─'.repeat(50));
      
      // 1. Perform search
      const searchResults = await this.performSearch(request);
      
      if (searchResults.length === 0) {
        return this.generateNoResultsAnswer(request.question, startTime);
      }
      
      // 2. Analyze search results
      const analysis = this.analyzeSearchResults(searchResults, request.question);
      
      // 3. Use Gemini to generate smart answer
      const answer = await this.generateGeminiAnswer(request.question, searchResults, request.answerOptions);
      
      // 4. Calculate confidence
      const confidence = this.calculateConfidence(searchResults, analysis);
      
      // 5. Prepare source document information
      const sources = this.prepareSources(searchResults, request.answerOptions);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`   ✅ QA completed, time taken: ${processingTime}ms`);
      console.log(`   📊 Confidence: ${(confidence * 100).toFixed(1)}%`);
      
      return {
        answer,
        confidence,
        sources,
        searchResults,
        processingTime
      };
      
    } catch (error) {
      console.error('❌ Smart QA failed:', error);
      return this.generateErrorAnswer(request.question, error, startTime);
    }
  }

  /**
   * Generate answer from existing search results (avoid duplicate search)
   */
  async generateAnswerFromResults(question: string, searchResults: SearchResult[]): Promise<QAAnswer> {
    const startTime = Date.now();
    
    try {
      console.log(`🤖 Generate answer from search results: "${question}"`);
      console.log(`📊 Using existing search results: ${searchResults.length}`);
      
      if (searchResults.length === 0) {
        return this.generateNoResultsAnswer(question, startTime);
      }
      
      // 1. Analyze search results
      const analysis = this.analyzeSearchResults(searchResults, question);
      
      // 2. Use Gemini to generate smart answer
      const answer = await this.generateGeminiAnswer(question, searchResults, {});
      
      // 3. Calculate confidence
      const confidence = this.calculateConfidence(searchResults, analysis);
      
      // 4. Prepare source document information
      const sources = this.prepareSources(searchResults, { includeSources: true });
      
      const processingTime = Date.now() - startTime;
      
      console.log(`   ✅ Answer generation completed, time taken: ${processingTime}ms`);
      console.log(`   📊 Confidence: ${(confidence * 100).toFixed(1)}%`);
      
      return {
        answer,
        confidence,
        sources,
        searchResults,
        processingTime
      };
      
    } catch (error) {
      console.error('❌ Failed to generate answer from search results:', error);
      return this.generateErrorAnswer(question, error, startTime);
    }
  }

  /**
   * Execute search
   */
  private async performSearch(request: QARequest): Promise<SearchResult[]> {
    const { searchOptions = {} } = request;
    const { topK, threshold = 0.5, useHybridSearch = true } = searchOptions;
    

    const topKInt = ensureIntegerTopK(topK);
    
    // Use standard search method (hybrid search not implemented yet)
    return await this.searchService.search(request.question, { topK: topKInt, threshold });
  }

  /**
   * Check if search should be executed (avoid duplicate searches)
   */
  private shouldPerformSearch(searchResults?: SearchResult[]): boolean {
    // If search results already exist, no need to search again
    return !searchResults || searchResults.length === 0;
  }

  /**
   * Analyze search results
   */
  private analyzeSearchResults(results: SearchResult[], question: string): any {
    const analysis = {
      topResults: results.slice(0, 3),
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      scoreDistribution: this.analyzeScoreDistribution(results),
      contentLength: results.reduce((sum, r) => sum + r.text.length, 0),
      keywordMatches: this.analyzeKeywordMatches(results, question)
    };
    
    return analysis;
  }

  /**
   * Analyze score distribution
   */
  private analyzeScoreDistribution(results: SearchResult[]): any {
    const scores = results.map(r => r.score).sort((a, b) => a - b);
    return {
      min: scores[0],
      max: scores[scores.length - 1],
      median: scores[Math.floor(scores.length / 2)],
      variance: this.calculateVariance(scores)
    };
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Analyze keyword matches
   */
  private analyzeKeywordMatches(results: SearchResult[], question: string): any {
    const keywords = this.extractKeywords(question);
    const matches = results.map(result => {
      const text = result.text.toLowerCase();
      const matchedKeywords = keywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      );
      return {
        resultId: result.id,
        matchedKeywords,
        matchRate: matchedKeywords.length / keywords.length
      };
    });
    
    return {
      keywords,
      matches,
      averageMatchRate: matches.reduce((sum, m) => sum + m.matchRate, 0) / matches.length
    };
  }

  /**
   * Extract keywords
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'is', 'in', 'has', 'and', 'with', 'or', 'but', 'while', 'if', 'then', 'because', 'so', 'what', 'how', 'when']);
    
    return text
      .split(/[\s，。！？；：""''（）【】]/)
      .map(word => word.trim())
      .filter(word => 
        word.length > 1 && 
        !stopWords.has(word) &&
        !/^[0-9]+$/.test(word)
      )
      .slice(0, 5);
  }

  /**
   * Use Gemini to generate smart answer
   */
  private async generateGeminiAnswer(
    question: string, 
    searchResults: SearchResult[], 
    options: any = {}
  ): Promise<string> {
    try {
      console.log('🤖 Calling Gemini API to generate answer...');
      
      // Convert search result format
      const convertedResults = searchResults.map(result => ({
        content: result.text,
        source: result.metadata.fileName || result.id,
        score: result.score,
        metadata: result.metadata
      }));
      
      // Call Gemini service
      const geminiResponse = await this.geminiService.generateAnswer({
        question,
        searchResults: convertedResults,
        responseType: 'qa_answer'
      });
      
      console.log(`✅ Gemini API call successful, answer length: ${geminiResponse.answer.length}`);
      console.log(`📊 Processing time: ${geminiResponse.metadata.processingTime}ms`);
      console.log(`🤖 Model used: ${geminiResponse.metadata.model}`);
      
      return geminiResponse.answer;
      
    } catch (error) {
      console.error('❌ Gemini API call failed, fallback to simple text generation:', error);
      
      // Fallback to simple text generation
      const analysis = this.analyzeSearchResults(searchResults, question);
      return this.generateSimpleAnswer(question, analysis, options);
    }
  }

  /**
   * Generate simple answer (fallback solution)
   */
  private generateSimpleAnswer(
    question: string, 
    analysis: any, 
    options: any = {}
  ): string {
    const { maxLength = 300, format = 'text' } = options;
    
    // Generate answer based on analysis results
    let answer = '';
    
    if (analysis.averageScore > 0.8) {
      // High confidence results
      answer = this.generateHighConfidenceAnswer(question, analysis);
    } else if (analysis.averageScore > 0.6) {
      // Medium confidence results
      answer = this.generateMediumConfidenceAnswer(question, analysis);
    } else {
      // Low confidence results
      answer = this.generateLowConfidenceAnswer(question, analysis);
    }
    
    // Limit length
    if (answer.length > maxLength) {
      answer = answer.substring(0, maxLength) + '...';
    }
    
    return answer;
  }

  /**
   * Generate high confidence answer
   */
  private generateHighConfidenceAnswer(question: string, analysis: any): string {
    const topResult = analysis.topResults[0];
    const questionType = this.classifyQuestionType(question);
    
    switch (questionType) {
      case 'how':
        return `According to relevant regulations, ${topResult.text}`;
      case 'what':
        return `According to document content, ${topResult.text}`;
      case 'when':
        return `According to regulations, ${topResult.text}`;
      case 'where':
        return `According to document, ${topResult.text}`;
      default:
        return topResult.text;
    }
  }

  /**
   * Generate medium confidence answer
   */
  private generateMediumConfidenceAnswer(question: string, analysis: any): string {
    const topResults = analysis.topResults.slice(0, 2);
    const combinedText = topResults.map((r: any) => r.text).join('。');
    
    return `According to relevant documents, ${combinedText}`;
  }

  /**
   * Generate low confidence answer
   */
  private generateLowConfidenceAnswer(question: string, analysis: any): string {
    return `Based on existing documents, I found some relevant information, but it may not be complete. I recommend you check the specific documents for more detailed information.`;
  }

  /**
   * Classify question type
   */
  private classifyQuestionType(question: string): string {
    if (question.includes('how') || question.includes('what way')) return 'how';
    if (question.includes('what') || question.includes('which')) return 'what';
    if (question.includes('when') || question.includes('time')) return 'when';
    if (question.includes('where') || question.includes('location')) return 'where';
    return 'general';
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(results: SearchResult[], analysis: any): number {
    let confidence = 0;
    
    // Based on search score
    confidence += analysis.averageScore * 0.4;
    
    // Based on result count
    confidence += Math.min(results.length / 5, 1) * 0.2;
    
    // Based on score distribution
    const scoreVariance = analysis.scoreDistribution.variance;
    confidence += Math.max(0, 1 - scoreVariance) * 0.2;
    
    // Based on keyword matching
    confidence += analysis.keywordMatches.averageMatchRate * 0.2;
    
    return Math.min(confidence, 1);
  }

  /**
   * Prepare source document information
   */
  private prepareSources(
    results: SearchResult[], 
    options: any = {}
  ): Array<{ text: string; score: number; metadata: any }> {
    const { includeSources = true } = options;
    
    if (!includeSources) {
      return [];
    }
    
    return results.slice(0, 3).map(result => ({
      text: result.text.substring(0, 100) + '...',
      score: result.score,
      metadata: result.metadata
    }));
  }

  /**
   * Generate no results answer
   */
  private generateNoResultsAnswer(question: string, startTime: number): QAAnswer {
    const processingTime = Date.now() - startTime;
    
    return {
      answer: 'Sorry, I could not find information related to your question in the existing documents. I recommend trying different keywords or checking other relevant documents.',
      confidence: 0,
      sources: [],
      searchResults: [],
      processingTime
    };
  }

  /**
   * Generate error answer
   */
  private generateErrorAnswer(question: string, error: any, startTime: number): QAAnswer {
    const processingTime = Date.now() - startTime;
    
    return {
      answer: 'Sorry, an error occurred while processing your question. Please try again later or contact technical support.',
      confidence: 0,
      sources: [],
      searchResults: [],
      processingTime
    };
  }

  /**
   * Batch QA
   */
  async batchAsk(questions: string[]): Promise<QAAnswer[]> {
    console.log(`🤖 Batch QA: ${questions.length} questions`);
    
    const answers: QAAnswer[] = [];
    
    for (const question of questions) {
      try {
        const answer = await this.ask({ question });
        answers.push(answer);
      } catch (error) {
        console.error(`❌ Question "${question}" processing failed:`, error);
        const errorAnswer = this.generateErrorAnswer(question, error, Date.now());
        answers.push(errorAnswer);
      }
    }
    
    console.log(`✅ Batch QA completed, successfully processed ${answers.length} questions`);
    return answers;
  }
} 