import neo4j, { Driver, Session, Transaction } from 'neo4j-driver';
import { config } from '../config/settings';

export class Neo4jManager {
  private driver: Driver;
  private isConnected: boolean = false;

  constructor() {
    this.driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.username, config.neo4j.password),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
      }
    );
  }

  async connect(): Promise<void> {
    try {
      await this.driver.verifyConnectivity();
      this.isConnected = true;
      console.log('✅ Neo4j connection successful');
    } catch (error) {
      console.error('❌ Neo4j connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
      console.log('🔌 Neo4j connection closed');
    }
  }

  getSession(): Session {
    if (!this.isConnected) {
      throw new Error('Neo4j not connected');
    }
    return this.driver.session({
      database: config.neo4j.database,
    });
  }

  async executeQuery<T = any>(
    query: string,
    parameters?: Record<string, any>
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async executeWriteQuery<T = any>(
    query: string,
    parameters?: Record<string, any>
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async createConstraints(): Promise<void> {
    // Use more compatible constraint syntax
    const constraints = [
      'CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:__Chunk__) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:__Document__) REQUIRE d.id IS UNIQUE',
    ];

    for (const constraint of constraints) {
      try {
        await this.executeWriteQuery(constraint);
        console.log(`✅ Constraint created successfully: ${constraint}`);
      } catch (error) {
        console.warn(`⚠️ Constraint creation failed: ${constraint}`, error);
      }
    }
  }

  async createIndexes(): Promise<void> {
    // Create only necessary indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS FOR (c:__Chunk__) ON (c.document_id)',
    ];

    for (const index of indexes) {
      try {
        await this.executeWriteQuery(index);
        console.log(`✅ Index created successfully: ${index}`);
      } catch (error) {
        console.warn(`⚠️ Index creation failed: ${index}`, error);
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeQuery('RETURN 1 as health');
      return result.length > 0;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const neo4jManager = new Neo4jManager();
export default neo4jManager; 