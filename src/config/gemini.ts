import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiConfig } from './unified-config';

// Initialize Gemini client
export const geminiClient = new GoogleGenerativeAI(getGeminiConfig().apiKey);

// Prompt template
export const ANSWER_GENERATION_PROMPT = `
---Role--- 
You are a helpful assistant. Please answer questions based on the user's input context and retrieved document fragments (chunks), and follow the answer requirements.

---Task Description--- 
Based on the content of retrieved document fragments, generate a reply of the required length and format to answer the user's question. 

---Answer Requirements---
- You must strictly answer based on the content of retrieved document fragments, and are prohibited from answering questions based on common sense and known information.
- For information not found in the retrieved document fragments, directly answer "I don't know."
- The final reply should remove all irrelevant information from the document fragments and merge relevant information into a comprehensive answer that explains all key points and their meaning, and meets the required length and format.
- According to the required length and format, divide the reply into appropriate sections and paragraphs, and use markdown syntax to mark the reply style.
- If the reply references data from document fragments, use the original document fragment's id as the ID.
- **Do not list more than 5 reference record IDs in one reference**. Instead, list the top 5 most relevant reference record IDs.
- Do not include information without supporting evidence.

---Reply Length and Format--- 
- The reply should be concise and clear, with key points highlighted
- According to the required length and format, divide the reply into appropriate sections and paragraphs, and use markdown syntax to mark the reply style.
- Output data references at the end of the reply, as a separate paragraph.

Output reference data format:

### Reference Data
{{'data': {{'Chunks':[comma-separated id list] }} }}

Example:
### Reference Data
{{'data': {{'Chunks':['chunk_id_1','chunk_id_2'] }} }}
`;

// Streaming answer prompt template
export const STREAM_ANSWER_PROMPT = `
---Role--- 
You are a helpful assistant generating answers based on retrieved document fragments.

---Task Description--- 
Please generate a coherent and accurate answer based on the content of retrieved document fragments to respond to the user's question.

---Answer Requirements---
- Strictly answer based on the content of retrieved document fragments
- For unknown information, directly say "I don't know"
- Integrate relevant information into a coherent answer
- Use markdown format to organize content
- Provide reference data at the end of the answer

---User Question---
{question}

---Retrieved Document Fragments---
{context}

Please generate the answer:
`; 