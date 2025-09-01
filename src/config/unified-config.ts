/**
 * Unified Configuration Manager
 * Centralized management of all system configurations, avoiding scattered and duplicate configurations
 */

// Gemini configuration
export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeout: number;
}

// Embedding configuration
export interface EmbeddingConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  cacheTTL: number;
}

// Neo4j configuration
export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
  maxConnectionPoolSize: number;
  connectionTimeout: number;
  maxTransactionRetryTime: number;
}

// Application configuration
export interface AppConfig {
  port: number;
  nodeEnv: string;
  enableLogging: boolean;
  enableMetrics: boolean;
}

// Document processing configuration
export interface DocumentProcessingConfig {
  maxFileSize: number;
  supportedFormats: string[];
  chunkSize: number;
  overlap: number;
  maxTextLength: number;
  preserveSentences: boolean;
  multilingualSupport: boolean;
}

// Batch processing configuration
export interface BatchConfig {
  size: number;
  maxWorkers: number;
  timeout: number;
}

// Service configuration
export interface ServiceConfig {
  enableGemini: boolean;
  enableEmbedding: boolean;
  enableVectorSearch: boolean;
  enableQA: boolean;
}

/**
 * Load configuration from environment variables
 */
function loadConfig() {
  // Gemini configuration
  const geminiConfig: GeminiConfig = {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
    maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '2048'),
    timeout: parseInt(process.env.GEMINI_TIMEOUT || '30000'),
  };

  // Embedding configuration
  const embeddingConfig: EmbeddingConfig = {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.EMBEDDING_MODEL || 'embedding-001',
    baseURL: process.env.EMBEDDING_BASE_URL,
    timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000'),
    retryAttempts: parseInt(process.env.EMBEDDING_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.EMBEDDING_RETRY_DELAY || '1000'),
    cacheTTL: parseInt(process.env.EMBEDDING_CACHE_TTL || '3600000'), // 1 hour
  };

  // Neo4j configuration
  const neo4jConfig: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
    maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_CONNECTION_POOL_SIZE || '50'),
    connectionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '30000'),
    maxTransactionRetryTime: parseInt(process.env.NEO4J_MAX_TRANSACTION_RETRY_TIME || '15000'),
  };

  // Application configuration
  const appConfig: AppConfig = {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    enableLogging: process.env.ENABLE_LOGGING !== 'false',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
  };

  // Document processing configuration
  const documentProcessingConfig: DocumentProcessingConfig = {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    supportedFormats: (process.env.SUPPORTED_FORMATS || 'txt,md,pdf,docx').split(','),
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
    overlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
    maxTextLength: parseInt(process.env.MAX_TEXT_LENGTH || '1000000'), // 1MB
    preserveSentences: process.env.PRESERVE_SENTENCES !== 'false',
    multilingualSupport: process.env.MULTILINGUAL_SUPPORT === 'true',
  };

  // Batch processing configuration
  const batchConfig: BatchConfig = {
    size: parseInt(process.env.BATCH_SIZE || '100'),
    maxWorkers: parseInt(process.env.MAX_WORKERS || '4'),
    timeout: parseInt(process.env.BATCH_TIMEOUT || '300000'), // 5 minutes
  };

  // Service configuration
  const serviceConfig: ServiceConfig = {
    enableGemini: process.env.ENABLE_GEMINI !== 'false',
    enableEmbedding: process.env.ENABLE_EMBEDDING !== 'false',
    enableVectorSearch: process.env.ENABLE_VECTOR_SEARCH !== 'false',
    enableQA: process.env.ENABLE_QA !== 'false',
  };

  return {
    gemini: geminiConfig,
    embedding: embeddingConfig,
    neo4j: neo4jConfig,
    app: appConfig,
    documentProcessing: documentProcessingConfig,
    batch: batchConfig,
    service: serviceConfig,
  };
}

// Export configuration functions
export const config = loadConfig();

export const getGeminiConfig = () => config.gemini;
export const getEmbeddingConfig = () => config.embedding;
export const getNeo4jConfig = () => config.neo4j;
export const getAppConfig = () => config.app;
export const getDocumentProcessingConfig = () => config.documentProcessing;
export const getBatchConfig = () => config.batch;
export const getServiceConfig = () => config.service;

export default config; 