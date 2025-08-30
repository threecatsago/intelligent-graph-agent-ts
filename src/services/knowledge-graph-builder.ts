import path from 'path';
import DocumentProcessor from './document-processor';
import { GraphStructureBuilder } from './graph-structure-builder';
import { ProcessedDocument } from '../models/types';

export class KnowledgeGraphBuilder {
  private documentProcessor: DocumentProcessor;
  private graphStructureBuilder: GraphStructureBuilder;

  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.graphStructureBuilder = new GraphStructureBuilder();
  }

  /**
   * Main process for building knowledge graph
   */
  async buildKnowledgeGraph(inputPath: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🏗️ Starting knowledge graph construction...');
      console.log(`📁 Input path: ${inputPath}`);

      // 1. Process documents
      console.log('\n📄 Step 1: Processing documents...');
      console.log('⏳ Starting document processing...');
      const documents = await this.documentProcessor.processDirectory(inputPath);
      console.log('✅ Document processing completed');
      
      if (documents.length === 0) {
        console.log('⚠️ No documents found to process');
        return;
      }

      console.log(`✅ Successfully processed ${documents.length} documents`);
      this.printDocumentSummary(documents);

      // 2. Build graph structure
      console.log('\n🔗 Step 2: Building graph structure...');
      console.log('⏳ Starting graph structure construction...');
      await this.graphStructureBuilder.processDocuments(documents);
      console.log('✅ Graph structure construction completed');

      // 3. Get statistics
      console.log('\n📊 Step 3: Getting statistics...');
      console.log('⏳ Getting statistics...');
      const stats = await this.getDatabaseStats();
      this.printDatabaseStats(stats);

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`\n🎉 Knowledge graph construction completed! Total time: ${duration.toFixed(2)} seconds`);
      
    } catch (error) {
      console.error('❌ Knowledge graph construction failed:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Clean and rebuild
   */
  async rebuildKnowledgeGraph(inputPath: string): Promise<void> {
    try {
      console.log('🔄 Starting knowledge graph rebuild...');
      
      // Clear existing data
      await this.graphStructureBuilder.clearDatabase();
      
      // Rebuild
      await this.buildKnowledgeGraph(inputPath);
      
    } catch (error) {
      console.error('❌ Rebuild failed:', error);
      throw error;
    }
  }

  /**
   * Print document summary
   */
  private printDocumentSummary(documents: ProcessedDocument[]): void {
    console.log('\n📋 Document Summary:');
    console.log('─'.repeat(50));
    
    let totalChunks = 0;
    let totalSize = 0;
    
    documents.forEach((doc, index) => {
      const chunks = doc.chunks.length;
      const size = doc.content.length;
      totalChunks += chunks;
      totalSize += size;
      
      console.log(`${index + 1}. ${doc.filename}`);
      console.log(`   📝 Chunks: ${chunks}`);
      console.log(`   📏 Size: ${size.toLocaleString()} characters`);
      console.log(`   📅 Modified: ${doc.metadata?.modified || 'Unknown'}`);
      console.log('');
    });
    
    console.log('─'.repeat(50));
    console.log(`📊 Total: ${documents.length} documents, ${totalChunks} chunks, ${totalSize.toLocaleString()} characters`);
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats(): Promise<any> {
    try {
      const { neo4jManager } = await import('../database/neo4j');
      
      const stats = await neo4jManager.executeQuery(`
        MATCH (n)
        RETURN labels(n) as labels, count(n) as count
        ORDER BY count DESC
      `);

      const totalNodes = await neo4jManager.executeQuery(`
        MATCH (n) RETURN count(n) as total
      `);

      const totalRelationships = await neo4jManager.executeQuery(`
        MATCH ()-[r]->() RETURN count(r) as total
      `);

      return {
        nodeStats: stats,
        totalNodes: totalNodes[0]?.total || 0,
        totalRelationships: totalRelationships[0]?.total || 0,
      };
    } catch (error) {
      console.error('❌ Failed to get statistics:', error);
      return null;
    }
  }

  /**
   * Print database statistics
   */
  private printDatabaseStats(stats: any): void {
    if (!stats) {
      console.log('⚠️ Unable to get database statistics');
      return;
    }

    console.log('\n🗄️ Database Statistics:');
    console.log('─'.repeat(50));
    console.log(`📊 Total nodes: ${stats.totalNodes.toLocaleString()}`);
    console.log(`🔗 Total relationships: ${stats.totalRelationships.toLocaleString()}`);
    
    if (stats.nodeStats && stats.nodeStats.length > 0) {
      console.log('\n📈 Node type distribution:');
      stats.nodeStats.forEach((stat: any) => {
        const labels = stat.labels.join(':');
        console.log(`   ${labels}: ${stat.count.toLocaleString()}`);
      });
    }
    
    console.log('─'.repeat(50));
  }

  /**
   * Validate build result
   */
  async validateBuild(): Promise<boolean> {
    try {
      console.log('🔍 Validating build result...');
      
      const stats = await this.getDatabaseStats();
      
      if (!stats || stats.totalNodes === 0) {
        console.log('❌ Validation failed: No nodes in database');
        return false;
      }
      
      if (stats.totalRelationships === 0) {
        console.log('⚠️ Warning: No relationships in database');
      }
      
      console.log('✅ Validation passed');
      return true;
      
    } catch (error) {
      console.error('❌ Validation failed:', error);
      return false;
    }
  }
}

export default KnowledgeGraphBuilder; 