import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports
dotenv.config();

import { neo4jManager } from './database/neo4j';
import { getAppConfig, getNeo4jConfig, getGeminiConfig } from './config/unified-config';
import App from './server/app';

// Configuration is automatically loaded from environment variables

async function main() {
  try {
    console.log('🚀 Starting Intelligent Graph Database Agent System...');
    
    // Check environment variables
    console.log('🔑 Checking environment variables...');
    const appConfig = getAppConfig();
    const geminiConfig = getGeminiConfig();
    
    if (geminiConfig.apiKey) {
      console.log('✅ Gemini API key configured');
    } else {
      console.log('⚠️ Gemini API key not configured');
    }
    
    // Connect to Neo4j
    console.log('🔌 Connecting to Neo4j database...');
    await neo4jManager.connect();
    console.log('✅ Neo4j connection successful');
    
    // Start Express server
    console.log('🌐 Starting Express server...');
    const app = new App();
    app.listen();
    
    console.log('🎉 System startup completed!');
    console.log('📚 This is an intelligent graph database agent system');
    console.log('🔍 Supports document processing, knowledge graph construction, and intelligent search');
    console.log('💬 Provides REST API interfaces for frontend calls');
    
  } catch (error) {
    console.error('❌ System startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received termination signal, shutting down system...');
  try {
    await neo4jManager.disconnect();
    console.log('✅ System safely shut down');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

// Start the system
main().catch(console.error); 