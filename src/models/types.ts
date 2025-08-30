// Base node types
export interface BaseNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

// Document node
export interface DocumentNode extends BaseNode {
  labels: ['__Document__'];
  properties: {
    id: string;
    title: string;
    filename: string;
    content?: string;
    metadata?: Record<string, any>;
  };
}

// Text chunk node
export interface ChunkNode extends BaseNode {
  labels: ['__Chunk__'];
  properties: {
    id: string;
    text: string;
    n_tokens: number;
    chunk_index: number;
    document_id: string;
                // Additional metadata fields
    position: number;        // Position of chunk in document
    length: number;          // Length of chunk content
    content_offset: number;  // Offset of chunk in document
    fileName: string;        // File name
    tokens: number;          // Token count
  };
}

// Entity node
export interface EntityNode extends BaseNode {
  labels: ['__Entity__', ...string[]];
  properties: {
    id: string;
    name: string;
    type: string;
    description?: string;
    embedding?: number[];
    human_readable_id?: string;
    confidence_score?: number;
  };
}

// Relationship types
export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

// Community node
export interface CommunityNode extends BaseNode {
  labels: ['__Community__'];
  properties: {
    community: string;
    level: number;
    title: string;
    summary?: string;
    rank?: number;
  };
}

// Document processing result
export interface ProcessedDocument {
  filename: string;
  content: string;
  chunks: ChunkNode[];
  entity_data?: EntityNode[];
  metadata?: Record<string, any>;
}

// Search query
export interface SearchQuery {
  query: string;
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
}

// Search result
export interface SearchResult {
  content: string;
  source: string;
 score: number;
  metadata?: Record<string, any>;
}

// Agent message
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// Agent session
export interface AgentSession {
  id: string;
  messages: AgentMessage[];
  created_at: Date;
  updated_at: Date;
} 