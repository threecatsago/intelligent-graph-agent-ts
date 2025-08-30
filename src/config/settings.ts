import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Database configuration
  neo4j: {
    uri: process.env.NEO4J_URI || 'neo4j://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '12345678',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },

  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
  },

  // Application configuration
  app: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Cache configuration
  cache: {
    dir: process.env.CACHE_DIR || './cache',
    maxSize: parseInt(process.env.MAX_CACHE_SIZE || '1000'),
  },

  // Document processing configuration
  document: {
    chunkSize: 500,  // Reduce chunk size
    overlap: 50,     // Reduce overlap
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // Batch processing configuration
  batch: {
    size: 50,
    maxWorkers: 4,
  },
};

export default config; 