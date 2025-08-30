import dotenv from 'dotenv';
import { neo4jManager } from './database/neo4j';
import App from './server/app';
import { config } from './config/settings';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('🚀 Starting Intelligent Graph Database Agent System...');
    
    // Check environment variables
    console.log('🔑 Checking environment variables...');
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      console.log('✅ Gemini API key configured');
    } else {
      console.log('⚠️ Gemini API key not configured, will use fallback response generation');
    }
    
    // Connect to database
    console.log('🔌 Connecting to Neo4j database...');
    await neo4jManager.connect();
    
    // Start server
    console.log('🌐 Starting Express server...');
    const app = new App();
    app.listen();
    
    console.log('\n🎉 System startup completed!');
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
  console.log('\n🛑 Received interrupt signal, shutting down system...');
  
  try {
    await neo4jManager.disconnect();
    console.log('✅ System safely shut down');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error occurred while shutting down system:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received termination signal, shutting down system...');
  
  try {
    await neo4jManager.disconnect();
    console.log('✅ System safely shut down');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error occurred while shutting down system:', error);
    process.exit(1);
  }
});

// Start main program
main().catch((error) => {
  console.error('❌ Main program execution failed:', error);
  process.exit(1);
}); 