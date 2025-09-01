import neo4j, { Driver, Session, Transaction, QueryResult } from 'neo4j-driver';
import { getNeo4jConfig } from '../config/unified-config';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
  maxConnectionPoolSize: number;
  connectionTimeout: number;
  maxTransactionRetryTime: number;
}

export class Neo4jManager {
  private driver: Driver | null = null;
  private config: Neo4jConfig;

  constructor() {
    this.config = getNeo4jConfig();
  }

  async connect(): Promise<void> {
    try {
      // Add detailed debug logs
      console.log('🔌 Neo4j connection configuration:');
      console.log(`   URI: ${this.config.uri}`);
      console.log(`   Username: ${this.config.username}`);
      console.log(`   Password: ${this.config.password}`);
      console.log(`   Database: ${this.config.database}`);
      
      console.log('🔌 Connecting to Neo4j...');
      
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionTimeout: this.config.connectionTimeout,
          maxTransactionRetryTime: this.config.maxTransactionRetryTime,
        }
      );

      console.log('🔌 Verifying connection...');
      
      // Test connection
      const session = this.driver.session();
      await session.run('RETURN 1 as test');
      await session.close();
      
      console.log('✅ Neo4j connection successful');
    } catch (error) {
      console.error('❌ Neo4j connection failed:', error);
      console.error('🔍 Error details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        config: {
          uri: this.config.uri,
          username: this.config.username,
          database: this.config.database,
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionTimeout: this.config.connectionTimeout,
          maxTransactionRetryTime: this.config.maxTransactionRetryTime
        }
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('🔌 Neo4j connection closed');
    }
  }

  async executeQuery(query: string, parameters: any = {}): Promise<any[]> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }

    const session = this.driver.session();
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async executeWriteQuery(query: string, parameters: any = {}): Promise<any[]> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }

    const session = this.driver.session();
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async createConstraints(): Promise<void> {
    try {
      console.log('⏳ Creating Neo4j constraints...');
      
      const constraints = [
        'CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS FOR (c:__Chunk__) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT document_filename_unique IF NOT EXISTS FOR (d:__Document__) REQUIRE d.fileName IS UNIQUE',
        'CREATE CONSTRAINT chunk_position_unique IF NOT EXISTS FOR (c:__Chunk__) REQUIRE (c.file_name, c.position) IS UNIQUE'
      ];

      for (const constraint of constraints) {
        try {
          await this.executeWriteQuery(constraint);
          console.log(`✅ Constraint created: ${constraint}`);
        } catch (error) {
          console.warn(`⚠️ Constraint creation failed: ${constraint}`, error);
        }
      }
      
      console.log('✅ All constraints created');
    } catch (error) {
      console.error('❌ Failed to create constraints:', error);
      throw error;
    }
  }

  async createIndexes(): Promise<void> {
    try {
      console.log('⏳ Creating Neo4j indexes...');
      
      const indexes = [
        'CREATE INDEX chunk_text_index IF NOT EXISTS FOR (c:__Chunk__) ON (c.text)',
        'CREATE INDEX document_filename_index IF NOT EXISTS FOR (d:__Document__) ON (d.fileName)',
        'CREATE INDEX chunk_file_position_index IF NOT EXISTS FOR (c:__Chunk__) ON (c.fileName, c.position)'
      ];

      for (const index of indexes) {
        try {
          await this.executeWriteQuery(index);
          console.log(`✅ Index created: ${index}`);
        } catch (error) {
          console.warn(`⚠️ Index creation failed: ${index}`, error);
        }
      }
      
      console.log('✅ All indexes created');
    } catch (error) {
      console.error('❌ Failed to create indexes:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.driver) {
        return false;
      }

      const session = this.driver.session();
      await session.run('RETURN 1 as health');
      await session.close();
      
      return true;
    } catch (error) {
      console.error('❌ Neo4j health check failed:', error);
      return false;
    }
  }

  getDriver(): Driver | null {
    return this.driver;
  }

  isConnected(): boolean {
    return this.driver !== null;
  }
}

// Export singleton instance
export const neo4jManager = new Neo4jManager(); 