/**
 * Content processing service for metadata enrichment and content chunking
 */

import { 
  ComprehendClient, 
  DetectEntitiesCommand, 
  DetectKeyPhrasesCommand, 
  DetectSentimentCommand,
  DetectDominantLanguageCommand,
  LanguageCode
} from '@aws-sdk/client-comprehend';
import { Document, ContentChunk, EnrichedMetadata, Entity, KeyPhrase, Sentiment } from './types';

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  chunkingStrategy: 'sentence' | 'paragraph' | 'fixed' | 'semantic';
  preserveStructure: boolean;
}

export interface ProcessingOptions {
  enableEntityDetection: boolean;
  enableKeyPhraseDetection: boolean;
  enableSentimentAnalysis: boolean;
  enableLanguageDetection: boolean;
  chunkingOptions: ChunkingOptions;
}

export class ContentProcessor {
  private comprehendClient: ComprehendClient;
  private defaultProcessingOptions: ProcessingOptions;

  constructor(region: string = 'us-east-1') {
    this.comprehendClient = new ComprehendClient({ region });
    this.defaultProcessingOptions = {
      enableEntityDetection: true,
      enableKeyPhraseDetection: true,
      enableSentimentAnalysis: true,
      enableLanguageDetection: true,
      chunkingOptions: {
        maxChunkSize: 1000,
        overlapSize: 100,
        chunkingStrategy: 'sentence',
        preserveStructure: true,
      },
    };
  }

  /**
   * Process document content with enrichment and chunking
   */
  async processContent(
    document: Document,
    options?: Partial<ProcessingOptions>
  ): Promise<{ chunks: ContentChunk[]; enrichedMetadata: EnrichedMetadata }> {
    const processingOptions = { ...this.defaultProcessingOptions, ...options };
    
    // Detect language first
    const languageCode = processingOptions.enableLanguageDetection 
      ? await this.detectLanguage(document.content)
      : 'en';

    // Enrich metadata
    const enrichedMetadata = await this.enrichMetadata(
      document.content, 
      languageCode, 
      processingOptions
    );

    // Chunk content
    const chunks = await this.chunkContent(
      document, 
      processingOptions.chunkingOptions
    );

    return { chunks, enrichedMetadata };
  }

  /**
   * Detect the dominant language of the text
   */
  async detectLanguage(text: string): Promise<LanguageCode> {
    try {
      const command = new DetectDominantLanguageCommand({ Text: text });
      const response = await this.comprehendClient.send(command);
      
      const dominantLanguage = response.Languages?.[0];
      return (dominantLanguage?.LanguageCode as LanguageCode) || LanguageCode.EN;
    } catch (error) {
      console.error('Error detecting language:', error);
      return LanguageCode.EN; // Default to English
    }
  }

  /**
   * Enrich document metadata using various NLP techniques
   */
  async enrichMetadata(
    text: string, 
    languageCode: LanguageCode, 
    options: ProcessingOptions
  ): Promise<EnrichedMetadata> {
    const enrichedMetadata: EnrichedMetadata = {
      entities: [],
      key_phrases: [],
      language_code: languageCode as string,
      topics: [],
    };

    try {
      // Detect entities
      if (options.enableEntityDetection) {
        enrichedMetadata.entities = await this.detectEntities(text, languageCode);
      }

      // Detect key phrases
      if (options.enableKeyPhraseDetection) {
        enrichedMetadata.key_phrases = await this.detectKeyPhrases(text, languageCode);
      }

      // Analyze sentiment
      if (options.enableSentimentAnalysis) {
        enrichedMetadata.sentiment = await this.analyzeSentiment(text, languageCode);
      }

      // Extract topics from entities and key phrases
      enrichedMetadata.topics = this.extractTopics(
        enrichedMetadata.entities, 
        enrichedMetadata.key_phrases
      );

    } catch (error) {
      console.error('Error enriching metadata:', error);
    }

    return enrichedMetadata;
  }

  /**
   * Detect named entities in text
   */
  private async detectEntities(text: string, languageCode: LanguageCode): Promise<Entity[]> {
    try {
      const command = new DetectEntitiesCommand({
        Text: text,
        LanguageCode: languageCode,
      });

      const response = await this.comprehendClient.send(command);
      
      return response.Entities?.map(entity => ({
        text: entity.Text || '',
        type: entity.Type || 'OTHER',
        confidence: entity.Score || 0,
        begin_offset: entity.BeginOffset || 0,
        end_offset: entity.EndOffset || 0,
      })) || [];
    } catch (error) {
      console.error('Error detecting entities:', error);
      return [];
    }
  }

  /**
   * Detect key phrases in text
   */
  private async detectKeyPhrases(text: string, languageCode: LanguageCode): Promise<KeyPhrase[]> {
    try {
      const command = new DetectKeyPhrasesCommand({
        Text: text,
        LanguageCode: languageCode,
      });

      const response = await this.comprehendClient.send(command);
      
      return response.KeyPhrases?.map(phrase => ({
        text: phrase.Text || '',
        confidence: phrase.Score || 0,
        begin_offset: phrase.BeginOffset || 0,
        end_offset: phrase.EndOffset || 0,
      })) || [];
    } catch (error) {
      console.error('Error detecting key phrases:', error);
      return [];
    }
  }

  /**
   * Analyze sentiment of text
   */
  private async analyzeSentiment(text: string, languageCode: LanguageCode): Promise<Sentiment | undefined> {
    try {
      const command = new DetectSentimentCommand({
        Text: text,
        LanguageCode: languageCode,
      });

      const response = await this.comprehendClient.send(command);
      
      if (response.Sentiment && response.SentimentScore) {
        const scores = response.SentimentScore;
        const maxScore = Math.max(
          scores.Positive || 0,
          scores.Negative || 0,
          scores.Neutral || 0,
          scores.Mixed || 0
        );

        return {
          sentiment: response.Sentiment as Sentiment['sentiment'],
          confidence: maxScore,
        };
      }
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
    }

    return undefined;
  }

  /**
   * Extract topics from entities and key phrases
   */
  private extractTopics(entities: Entity[], keyPhrases: KeyPhrase[]): string[] {
    const topics = new Set<string>();

    // Add high-confidence entities as topics
    entities
      .filter(entity => entity.confidence > 0.8)
      .forEach(entity => topics.add(entity.text.toLowerCase()));

    // Add high-confidence key phrases as topics
    keyPhrases
      .filter(phrase => phrase.confidence > 0.8)
      .forEach(phrase => topics.add(phrase.text.toLowerCase()));

    return Array.from(topics).slice(0, 10); // Limit to top 10 topics
  }

  /**
   * Chunk document content based on specified strategy
   */
  async chunkContent(document: Document, options: ChunkingOptions): Promise<ContentChunk[]> {
    switch (options.chunkingStrategy) {
      case 'sentence':
        return this.chunkBySentence(document, options);
      case 'paragraph':
        return this.chunkByParagraph(document, options);
      case 'semantic':
        return this.chunkBySemantic(document, options);
      case 'fixed':
      default:
        return this.chunkByFixedSize(document, options);
    }
  }

  /**
   * Chunk content by fixed character size
   */
  private chunkByFixedSize(document: Document, options: ChunkingOptions): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const content = document.content;
    let chunkIndex = 0;

    for (let i = 0; i < content.length; i += options.maxChunkSize - options.overlapSize) {
      const start = i;
      const end = Math.min(i + options.maxChunkSize, content.length);
      const chunkContent = content.substring(start, end);

      chunks.push({
        id: `${document.id}_chunk_${chunkIndex}`,
        document_id: document.id,
        content: chunkContent,
        chunk_index: chunkIndex,
        start_position: start,
        end_position: end,
      });

      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Chunk content by sentences
   */
  private chunkBySentence(document: Document, options: ChunkingOptions): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const sentences = this.splitIntoSentences(document.content);
    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

      if (potentialChunk.length > options.maxChunkSize && currentChunk) {
        // Create chunk from current content
        const chunkEnd = currentStart + currentChunk.length;
        chunks.push({
          id: `${document.id}_chunk_${chunkIndex}`,
          document_id: document.id,
          content: currentChunk,
          chunk_index: chunkIndex,
          start_position: currentStart,
          end_position: chunkEnd,
        });

        chunkIndex++;
        
        // Start new chunk with overlap
        if (options.overlapSize > 0 && chunks.length > 0) {
          const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - options.overlapSize));
          currentChunk = overlapText + ' ' + sentence;
          currentStart = chunkEnd - overlapText.length - 1;
        } else {
          currentChunk = sentence;
          currentStart = chunkEnd + 1;
        }
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add final chunk if there's remaining content
    if (currentChunk) {
      chunks.push({
        id: `${document.id}_chunk_${chunkIndex}`,
        document_id: document.id,
        content: currentChunk,
        chunk_index: chunkIndex,
        start_position: currentStart,
        end_position: currentStart + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Chunk content by paragraphs
   */
  private chunkByParagraph(document: Document, options: ChunkingOptions): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const paragraphs = document.content.split(/\n\s*\n/);
    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;

      if (potentialChunk.length > options.maxChunkSize && currentChunk) {
        // Create chunk from current content
        const chunkEnd = currentStart + currentChunk.length;
        chunks.push({
          id: `${document.id}_chunk_${chunkIndex}`,
          document_id: document.id,
          content: currentChunk,
          chunk_index: chunkIndex,
          start_position: currentStart,
          end_position: chunkEnd,
        });

        chunkIndex++;
        currentChunk = paragraph;
        currentStart = chunkEnd + 2; // Account for paragraph separator
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add final chunk
    if (currentChunk) {
      chunks.push({
        id: `${document.id}_chunk_${chunkIndex}`,
        document_id: document.id,
        content: currentChunk,
        chunk_index: chunkIndex,
        start_position: currentStart,
        end_position: currentStart + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Chunk content by semantic boundaries (simplified implementation)
   */
  private chunkBySemantic(document: Document, options: ChunkingOptions): ContentChunk[] {
    // For now, fall back to sentence-based chunking
    // In a full implementation, this would use more sophisticated NLP
    return this.chunkBySentence(document, options);
  }

  /**
   * Split text into sentences using simple heuristics
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in production, use a proper NLP library
    return text
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
  }

  /**
   * Calculate content statistics
   */
  calculateContentStats(content: string): {
    characterCount: number;
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
  } {
    return {
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      sentenceCount: this.splitIntoSentences(content).length,
      paragraphCount: content.split(/\n\s*\n/).length,
    };
  }
}