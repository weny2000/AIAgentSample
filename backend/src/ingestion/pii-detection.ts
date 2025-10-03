/**
 * PII detection and masking service using Amazon Comprehend
 */

import { 
  ComprehendClient, 
  DetectPiiEntitiesCommand, 
  ContainsPiiEntitiesCommand,
  PiiEntity,
  PiiEntityType,
  LanguageCode
} from '@aws-sdk/client-comprehend';
import { PIIDetection } from './types';

export interface PIIMaskingOptions {
  maskingChar: string;
  preserveLength: boolean;
  maskingStrategy: 'full' | 'partial' | 'hash';
  partialMaskRatio: number; // For partial masking, what percentage to mask
}

export class PIIDetectionService {
  private comprehendClient: ComprehendClient;
  private defaultMaskingOptions: PIIMaskingOptions;

  constructor(region: string = 'us-east-1') {
    this.comprehendClient = new ComprehendClient({ region });
    this.defaultMaskingOptions = {
      maskingChar: '*',
      preserveLength: true,
      maskingStrategy: 'partial',
      partialMaskRatio: 0.7,
    };
  }

  /**
   * Detect PII entities in text using Amazon Comprehend
   */
  async detectPII(text: string, languageCode: LanguageCode = LanguageCode.EN): Promise<PIIDetection[]> {
    try {
      const command = new DetectPiiEntitiesCommand({
        Text: text,
        LanguageCode: languageCode,
      });

      const response = await this.comprehendClient.send(command);
      
      if (!response.Entities) {
        return [];
      }

      return response.Entities.map(entity => this.mapPiiEntity(entity, text));
    } catch (error) {
      console.error('Error detecting PII:', error);
      throw new Error(`PII detection failed: ${error}`);
    }
  }

  /**
   * Check if text contains PII without detailed analysis
   */
  async containsPII(text: string, languageCode: LanguageCode = LanguageCode.EN): Promise<boolean> {
    try {
      const command = new ContainsPiiEntitiesCommand({
        Text: text,
        LanguageCode: languageCode,
      });

      const response = await this.comprehendClient.send(command);
      
      return response.Labels?.some(label => (label.Score || 0) > 0.5) || false;
    } catch (error) {
      console.error('Error checking for PII:', error);
      return false; // Fail safe - assume no PII if detection fails
    }
  }

  /**
   * Mask PII in text based on detected entities
   */
  async maskPII(
    text: string, 
    piiDetections: PIIDetection[], 
    options?: Partial<PIIMaskingOptions>
  ): Promise<string> {
    const maskingOptions = { ...this.defaultMaskingOptions, ...options };
    let maskedText = text;

    // Sort detections by start offset in descending order to avoid offset issues
    const sortedDetections = [...piiDetections].sort((a, b) => b.start_offset - a.start_offset);

    for (const detection of sortedDetections) {
      const originalText = text.substring(detection.start_offset, detection.end_offset);
      const maskedValue = this.generateMask(originalText, detection.type, maskingOptions);
      
      maskedText = 
        maskedText.substring(0, detection.start_offset) +
        maskedValue +
        maskedText.substring(detection.end_offset);
    }

    return maskedText;
  }

  /**
   * Process text for PII detection and masking in one step
   */
  async processText(
    text: string, 
    languageCode: LanguageCode = LanguageCode.EN,
    maskingOptions?: Partial<PIIMaskingOptions>
  ): Promise<{ maskedText: string; piiDetections: PIIDetection[] }> {
    const piiDetections = await this.detectPII(text, languageCode);
    const maskedText = await this.maskPII(text, piiDetections, maskingOptions);

    return { maskedText, piiDetections };
  }

  /**
   * Map Comprehend PII entity to our PIIDetection format
   */
  private mapPiiEntity(entity: PiiEntity, originalText: string): PIIDetection {
    const startOffset = entity.BeginOffset || 0;
    const endOffset = entity.EndOffset || 0;
    const detectedText = originalText.substring(startOffset, endOffset);

    return {
      type: this.mapPiiEntityType(entity.Type),
      text: detectedText,
      confidence: entity.Score || 0,
      start_offset: startOffset,
      end_offset: endOffset,
      masked_text: this.generateMask(detectedText, this.mapPiiEntityType(entity.Type)),
    };
  }

  /**
   * Map Comprehend PII entity types to our standard types
   */
  private mapPiiEntityType(comprehendType?: PiiEntityType): PIIDetection['type'] {
    switch (comprehendType) {
      case 'EMAIL':
        return 'EMAIL';
      case 'PHONE':
        return 'PHONE';
      case 'SSN':
        return 'SSN';
      case 'CREDIT_DEBIT_NUMBER':
        return 'CREDIT_CARD';
      case 'NAME':
        return 'NAME';
      case 'ADDRESS':
        return 'ADDRESS';
      default:
        return 'NAME'; // Default fallback
    }
  }

  /**
   * Generate masked version of detected PII
   */
  private generateMask(
    text: string, 
    piiType: PIIDetection['type'], 
    options: PIIMaskingOptions = this.defaultMaskingOptions
  ): string {
    switch (options.maskingStrategy) {
      case 'full':
        return options.preserveLength 
          ? options.maskingChar.repeat(text.length)
          : `[${piiType}]`;

      case 'hash':
        // Simple hash-based masking (in production, use proper hashing)
        const hash = this.simpleHash(text);
        return options.preserveLength 
          ? `${options.maskingChar.repeat(Math.max(0, text.length - 8))}${hash.substring(0, 8)}`
          : `[${piiType}_${hash.substring(0, 8)}]`;

      case 'partial':
      default:
        return this.partialMask(text, piiType, options);
    }
  }

  /**
   * Apply partial masking based on PII type
   */
  private partialMask(text: string, piiType: PIIDetection['type'], options: PIIMaskingOptions): string {
    switch (piiType) {
      case 'EMAIL':
        const emailParts = text.split('@');
        if (emailParts.length === 2) {
          const username = emailParts[0];
          const domain = emailParts[1];
          const maskedUsername = username.length > 2 
            ? username.substring(0, 2) + options.maskingChar.repeat(username.length - 2)
            : options.maskingChar.repeat(username.length);
          return `${maskedUsername}@${domain}`;
        }
        break;

      case 'PHONE':
        if (text.length >= 4) {
          return options.maskingChar.repeat(text.length - 4) + text.substring(text.length - 4);
        }
        break;

      case 'CREDIT_CARD':
        if (text.length >= 4) {
          return options.maskingChar.repeat(text.length - 4) + text.substring(text.length - 4);
        }
        break;

      case 'SSN':
        if (text.length >= 4) {
          return options.maskingChar.repeat(text.length - 4) + text.substring(text.length - 4);
        }
        break;

      case 'NAME':
        if (text.length > 2) {
          return text.substring(0, 1) + options.maskingChar.repeat(text.length - 2) + text.substring(text.length - 1);
        }
        break;

      case 'ADDRESS':
        // For addresses, mask the middle portion
        if (text.length > 6) {
          const keepStart = Math.ceil(text.length * 0.2);
          const keepEnd = Math.ceil(text.length * 0.2);
          const maskLength = text.length - keepStart - keepEnd;
          return text.substring(0, keepStart) + 
                 options.maskingChar.repeat(maskLength) + 
                 text.substring(text.length - keepEnd);
        }
        break;
    }

    // Default partial masking
    const maskLength = Math.ceil(text.length * options.partialMaskRatio);
    const keepLength = text.length - maskLength;
    const keepStart = Math.floor(keepLength / 2);
    
    return text.substring(0, keepStart) + 
           options.maskingChar.repeat(maskLength) + 
           text.substring(keepStart + maskLength);
  }

  /**
   * Simple hash function for demonstration (use proper crypto in production)
   */
  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validate PII detection results
   */
  validateDetections(detections: PIIDetection[]): boolean {
    return detections.every(detection => 
      detection.confidence >= 0 && 
      detection.confidence <= 1 &&
      detection.start_offset >= 0 &&
      detection.end_offset > detection.start_offset &&
      detection.text.length === (detection.end_offset - detection.start_offset)
    );
  }
}