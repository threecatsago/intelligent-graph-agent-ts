import { getDocumentProcessingConfig } from '../config/unified-config';

export interface ChunkingOptions {
  chunkSize: number;
  overlap: number;
  maxTextLength: number;
  preserveSentences: boolean;
  multilingualSupport: boolean;
}

export interface TextStats {
  textLength: number;
  needsPreprocessing: boolean;
  estimatedChunks: number;
  paragraphs: number;
  lines: number;
  preprocessedSegments?: number;
  maxSegmentLength?: number;
}

export class EnhancedTextChunker {
  private options: ChunkingOptions;
  private sentenceEndings: RegExp;
  private paragraphSeparators: RegExp;

  constructor(options: Partial<ChunkingOptions> = {}) {
    const defaultConfig = getDocumentProcessingConfig();
    
    this.options = {
      chunkSize: options.chunkSize || defaultConfig.chunkSize,
      overlap: options.overlap || defaultConfig.overlap,
      maxTextLength: options.maxTextLength || defaultConfig.maxTextLength,
      preserveSentences: options.preserveSentences !== false ? defaultConfig.preserveSentences : false,
      multilingualSupport: options.multilingualSupport !== false ? defaultConfig.multilingualSupport : false,
    };

    // Multi-language sentence ending support
    this.sentenceEndings = this.options.multilingualSupport 
      ? /[。！？.!?]/
      : /[.!?]/;

    // Paragraph separators
    this.paragraphSeparators = /\n\s*\n/;
  }

  /**
   * Split text into intelligent chunks
   */
  chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Handle very short text
    if (text.length < this.options.chunkSize / 10) {
      return [text.trim()];
    }

    // Preprocess large text
    const textSegments = this.preprocessLargeText(text);
    
    // Process each text segment
    const allChunks: string[] = [];
    for (const segment of textSegments) {
      const segmentChunks = this.chunkSingleSegment(segment);
      allChunks.push(...segmentChunks);
    }

    return allChunks;
  }

  /**
   * Preprocess large text by splitting into smaller segments
   */
  private preprocessLargeText(text: string): string[] {
    if (text.length <= this.options.maxTextLength) {
      return [text];
    }

    // Calculate appropriate segment size
    const targetSegmentSize = Math.min(
      this.options.maxTextLength, 
      Math.max(10000, this.options.maxTextLength / 2)
    );

    // First split by paragraphs
    let paragraphs = text.split(this.paragraphSeparators);
    
    // If few paragraphs, try splitting by single newlines
    if (paragraphs.length < 5) {
      paragraphs = text.split('\n');
    }

    // Recombine paragraphs to ensure each segment doesn't exceed target size
    const processedSegments: string[] = [];
    let currentSegment = '';

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      // If current paragraph is too long, split it further
      if (trimmedPara.length > targetSegmentSize) {
        // Save current accumulated content first
        if (currentSegment) {
          processedSegments.push(currentSegment);
          currentSegment = '';
        }

        // Split long paragraph
        const splitParas = this.splitLongParagraph(trimmedPara, targetSegmentSize);
        processedSegments.push(...splitParas);
      } else {
        // Check if adding current paragraph would exceed target size
        if (currentSegment.length + trimmedPara.length + 2 > targetSegmentSize) {
          if (currentSegment) {
            processedSegments.push(currentSegment);
          }
          currentSegment = trimmedPara;
        } else {
          if (currentSegment) {
            currentSegment += '\n\n' + trimmedPara;
          } else {
            currentSegment = trimmedPara;
          }
        }
      }
    }

    // Add final segment
    if (currentSegment) {
      processedSegments.push(currentSegment);
    }

    return processedSegments;
  }

  /**
   * Split long paragraphs
   */
  private splitLongParagraph(text: string, maxSize: number): string[] {
    if (text.length <= maxSize) {
      return [text];
    }

    // Split by sentences
    const sentences = this.splitIntoSentences(text);

    // If no sentence boundaries found, split by fixed length
    if (sentences.length === 0) {
      return this.splitByFixedLength(text, maxSize);
    }

    // Recombine sentences to ensure they don't exceed max length
    const segments: string[] = [];
    let currentSegment = '';

    for (const sentence of sentences) {
      // If single sentence is too long, force split
      if (sentence.length > maxSize) {
        if (currentSegment) {
          segments.push(currentSegment);
          currentSegment = '';
        }

        // Split long sentence by fixed length
        const splitSentences = this.splitByFixedLength(sentence, maxSize);
        segments.push(...splitSentences);
      } else {
        // Check if adding current sentence would exceed max length
        if (currentSegment.length + sentence.length > maxSize) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = sentence;
        } else {
          currentSegment += sentence;
        }
      }
    }

    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    if (!this.options.preserveSentences) {
      return [text];
    }

    // Use regex to split sentences, preserving punctuation
    const sentenceParts = text.split(/([。！？.!?])/);
    const sentences: string[] = [];

    // Recombine sentences and punctuation
    for (let i = 0; i < sentenceParts.length - 1; i += 2) {
      const sentence = sentenceParts[i];
      const punctuation = sentenceParts[i + 1] || '';
      
      if (sentence.trim()) {
        sentences.push(sentence + punctuation);
      }
    }

    // Handle last part (if no punctuation)
    if (sentenceParts.length % 2 === 1 && sentenceParts[sentenceParts.length - 1].trim()) {
      sentences.push(sentenceParts[sentenceParts.length - 1]);
    }

    return sentences;
  }

  /**
   * Split text by fixed length
   */
  private splitByFixedLength(text: string, maxSize: number): string[] {
    const segments: string[] = [];
    for (let i = 0; i < text.length; i += maxSize) {
      segments.push(text.slice(i, i + maxSize));
    }
    return segments;
  }

  /**
   * Process single text segment chunking
   */
  private chunkSingleSegment(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // If text length is less than chunk size, return directly
    if (text.length <= this.options.chunkSize) {
      return [text.trim()];
    }

    const chunks: string[] = [];
    let startPos = 0;

    while (startPos < text.length) {
      // Determine current chunk end position
      let endPos = Math.min(startPos + this.options.chunkSize, text.length);

      // If not the last chunk and need to preserve sentence integrity, try to end at sentence boundary
      if (endPos < text.length && this.options.preserveSentences) {
        const sentenceEnd = this.findNextSentenceEnd(text, endPos);
        if (sentenceEnd <= startPos + this.options.chunkSize + 100) { // Allow slight overflow
          endPos = sentenceEnd;
        }
      }

      // Extract current chunk
      const chunk = text.slice(startPos, endPos).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      // Calculate next chunk start position (considering overlap)
      if (endPos >= text.length) {
        break;
      }

      // Find overlap start position
      const overlapStart = Math.max(startPos, endPos - this.options.overlap);
      
      if (this.options.preserveSentences) {
        const nextSentenceStart = this.findPreviousSentenceStart(text, overlapStart);
        
        // If suitable sentence start position found, use it; otherwise use calculated overlap position
        if (nextSentenceStart > startPos && nextSentenceStart < endPos) {
          startPos = nextSentenceStart;
        } else {
          startPos = overlapStart;
        }
      } else {
        startPos = overlapStart;
      }

      // Prevent infinite loop
      if (startPos >= endPos) {
        startPos = endPos;
      }
    }

    return chunks;
  }

  /**
   * Find next sentence end position from specified position
   */
  private findNextSentenceEnd(text: string, startPos: number): number {
    for (let i = startPos; i < text.length; i++) {
      if (this.isSentenceEnding(text[i])) {
        return i + 1;
      }
    }
    return text.length;
  }

  /**
   * Find previous sentence start position from specified position
   */
  private findPreviousSentenceStart(text: string, startPos: number): number {
    // First find previous sentence end position
    for (let i = startPos - 1; i >= 0; i--) {
      if (this.isSentenceEnding(text[i])) {
        // Skip whitespace after sentence end
        let nextPos = i + 1;
        while (nextPos < text.length && /\s/.test(text[nextPos])) {
          nextPos++;
        }
        return nextPos;
      }
    }
    return 0;
  }

  /**
   * Check if character is sentence ending
   */
  private isSentenceEnding(char: string): boolean {
    return this.sentenceEndings.test(char);
  }

  /**
   * Get text statistics
   */
  getTextStats(text: string): TextStats {
    const stats: TextStats = {
      textLength: text.length,
      needsPreprocessing: text.length > this.options.maxTextLength,
      estimatedChunks: Math.max(1, Math.floor(text.length / this.options.chunkSize)),
      paragraphs: text.split(this.paragraphSeparators).length,
      lines: text.split('\n').length,
    };

    if (stats.needsPreprocessing) {
      const segments = this.preprocessLargeText(text);
      stats.preprocessedSegments = segments.length;
      stats.maxSegmentLength = Math.max(...segments.map(seg => seg.length));
    }

    return stats;
  }

  /**
   * Create overlapping text chunks (for vector search)
   */
  createOverlappingChunks(text: string): string[] {
    const chunks = this.chunkText(text);
    const overlappingChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const currentChunk = chunks[i];
      
      // Add current chunk
      overlappingChunks.push(currentChunk);

      // If there is a next chunk, create overlapping chunk
      if (i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const overlapSize = Math.min(this.options.overlap, currentChunk.length, nextChunk.length);
        
        if (overlapSize > 0) {
          const overlapText = currentChunk.slice(-overlapSize) + nextChunk.slice(0, overlapSize);
          overlappingChunks.push(overlapText);
        }
      }
    }

    return overlappingChunks;
  }
} 