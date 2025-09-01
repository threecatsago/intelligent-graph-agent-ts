// Vector search service module exports

// Embedding model interface
export { 
  EmbeddingModel
} from '../embedding-manager';

// Gemini embedding model
export { 
  GeminiEmbeddingModel, 
  GeminiEmbeddingConfig
} from './gemini-embedding-model';

// Vector search service
export { 
  VectorSearchService,
  SearchResult as VectorSearchResult,
  SearchOptions
} from './vector-search';

// Smart QA service
export { 
  QAService,
  QARequest,
  QAAnswer
} from './qa-service'; 