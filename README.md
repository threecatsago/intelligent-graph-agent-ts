# Intelligent Graph Database Agent System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A sophisticated intelligent agent system that combines document processing, knowledge graph construction, and AI-powered search capabilities using Neo4j graph database and modern AI services.

## 🚀 Features

- **Document Processing**: Intelligent document parsing and chunking with configurable parameters
- **Knowledge Graph Construction**: Automated building of knowledge graphs from processed documents
- **AI-Powered Search**: Hybrid search combining semantic and keyword-based approaches
- **Intelligent Agents**: Configurable AI agents for query processing and response generation
- **Graph Database Integration**: Full Neo4j integration for efficient graph operations
- **REST API**: Comprehensive API endpoints for frontend integration
- **File Upload Support**: Multi-format document upload and processing
- **Session Management**: Persistent conversation sessions for enhanced user experience

## 🏗️ Architecture

The system is built with a modular architecture consisting of:

- **Services Layer**: Document processing, graph building, and AI services
- **Agents Layer**: Intelligent query processing and response generation
- **Database Layer**: Neo4j integration and graph operations
- **Search Layer**: Hybrid search algorithms and result ranking
- **API Layer**: Express.js server with REST endpoints

## 🛠️ Technology Stack

- **Backend**: Node.js + TypeScript
- **Database**: Neo4j Graph Database
- **AI Services**: Google Gemini AI, OpenAI
- **Framework**: Express.js
- **Document Processing**: Custom chunking and parsing algorithms
- **Search**: Hybrid semantic + keyword search
- **Testing**: Jest

## 📋 Prerequisites

- Node.js 18+ 
- Neo4j Database (local or cloud instance)
- Google Gemini API key (optional, for enhanced AI capabilities)
- OpenAI API key (optional, for fallback AI services)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd intelligent-graph-agent
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file based on the provided template:

```bash
cp env.example .env
```

Configure your environment variables:

```env
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# AI Service Keys (Optional)
GOOGLE_GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 4. Build the Project

```bash
npm run build
```

### 5. Start the System

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## 📚 Usage

### Building Knowledge Graphs

```typescript
import { KnowledgeGraphBuilder } from './src/services/knowledge-graph-builder';

const builder = new KnowledgeGraphBuilder();
await builder.buildKnowledgeGraph('./documents');
```

### Using Intelligent Agents

```typescript
import { SimpleAgent } from './src/agents/simple-agent';

const agent = new SimpleAgent();
const response = await agent.processQuery('session123', 'What is machine learning?');
```

### Document Processing

```typescript
import DocumentProcessor from './src/services/document-processor';

const processor = new DocumentProcessor();
const documents = await processor.processDirectory('./documents');
```

## 🔧 Configuration

The system can be configured through the `src/config/settings.ts` file:

- **Document Processing**: Chunk size, overlap, max file size
- **Search**: Result limits, similarity thresholds
- **Database**: Connection settings, query timeouts
- **AI Services**: Model selection, response generation parameters

## 📡 API Endpoints

### Document Management
- `POST /api/documents/upload` - Upload documents
- `POST /api/documents/process` - Process documents
- `GET /api/documents` - List processed documents

### Knowledge Graph
- `POST /api/graph/build` - Build knowledge graph
- `GET /api/graph/stats` - Get graph statistics
- `POST /api/graph/rebuild` - Rebuild knowledge graph

### Search & Query
- `POST /api/search` - Perform search queries
- `POST /api/query` - Process natural language queries

### Agent Management
- `POST /api/agent/query` - Send query to agent
- `GET /api/agent/sessions` - List active sessions

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## 📁 Project Structure

```
src/
├── agents/           # AI agent implementations
├── config/           # Configuration and settings
├── database/         # Neo4j database integration
├── models/           # TypeScript type definitions
├── search/           # Search algorithms and implementations
├── server/           # Express.js server setup
├── services/         # Core business logic services
└── index.ts          # Application entry point
```

## 🔍 Search Capabilities

The system implements a sophisticated hybrid search approach:

1. **Semantic Search**: AI-powered understanding of query intent
2. **Keyword Search**: Traditional keyword matching
3. **Graph Traversal**: Leveraging Neo4j graph relationships
4. **Result Ranking**: Intelligent result scoring and ordering

## 🤖 AI Integration

- **Google Gemini**: Primary AI service for advanced reasoning
- **OpenAI**: Fallback AI service for response generation
- **LangChain**: Framework for AI agent orchestration
- **Custom Agents**: Extensible agent architecture for specialized tasks

## 📊 Performance Features

- **Document Chunking**: Efficient text processing with configurable overlap
- **Batch Processing**: Optimized database operations
- **Caching**: Intelligent result caching for repeated queries
- **Async Operations**: Non-blocking I/O for improved responsiveness

## 🚀 Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Neo4j team for the excellent graph database
- Google AI for Gemini capabilities
- OpenAI for AI service integration
- Express.js community for the robust web framework

## 📞 Support

For questions and support:

- Create an issue in the GitHub repository
- Check the documentation in the `document/` folder
- Review the configuration examples

---

**Built with ❤️ using TypeScript, Node.js, and Neo4j** 