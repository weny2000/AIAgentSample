/**
 * Sensitive Data Protection Service
 * Comprehensive PII detection, masking, and data protection for work task content
 */

import { PIIDetectionService, PIIMaskingOptions } from '../ingestion/pii-detection';
import { Logger } from '../lambda/utils/logger';
import { LanguageCode } from '@aws-sdk/client-comprehend';
import { PIIDetection } from '../ingestion/types';

export interface SensitiveDataScanResult {
  hasSensitiveData: boolean;
  piiDetections: PIIDetection[];
  maskedContent: string;
  originalContent: string;
  sensitivityScore: number; // 0-100
  detectionTimestamp: string;
  categories: SensitiveDataCategory[];
}

export interface SensitiveDataCategory {
  category: 'PII' | 'CREDENTIALS' | 'FINANCIAL' | 'HEALTH' | 'PROPRIETARY';
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  items: string[];
}

export interface DataProtectionPolicy {
  policyId: string;
  teamId?: string;
  autoMaskPII: boolean;
  allowedPIITypes: string[];
  requireApprovalForSensitiveData: boolean;
  retentionPeriodDays: number;
  encryptionRequired: boolean;
  auditAllAccess: boolean;
}

export class SensitiveDataProtectionService {
  private piiDetectionService: PIIDetectionService;
  private logger: Logger;
  private defaultPolicy: DataProtectionPolicy;

  // Patterns for detecting credentials and secrets
  private readonly credentialPatterns = [
    { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/gi, severity: 'critical' as const },
    { name: 'AWS Secret Key', pattern: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/gi, severity: 'critical' as const },
    { name: 'API Key', pattern: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, severity: 'high' as const },
    { name: 'Password', pattern: /password\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, severity: 'high' as const },
    { name: 'Private Key', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, severity: 'critical' as const },
    { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gi, severity: 'high' as const },
    { name: 'Database Connection String', pattern: /(?:mongodb|mysql|postgresql|mssql):\/\/[^\s]+/gi, severity: 'critical' as const },
    { name: 'OAuth Token', pattern: /oauth[_-]?token\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, severity: 'high' as const },
  ];

  // Patterns for financial data
  private readonly financialPatterns = [
    { name: 'Bank Account', pattern: /\b\d{8,17}\b/g, severity: 'high' as const },
    { name: 'Routing Number', pattern: /\b\d{9}\b/g, severity: 'medium' as const },
    { name: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g, severity: 'high' as const },
  ];

  // Patterns for proprietary information
  private readonly proprietaryPatterns = [
    { name: 'Confidential Marker', pattern: /\b(confidential|proprietary|internal\s+only|trade\s+secret)\b/gi, severity: 'medium' as const },
    { name: 'Copyright', pattern: /©|\(c\)|copyright/gi, severity: 'low' as const },
  ];

  constructor(region: string = 'us-east-1') {
    this.piiDetectionService = new PIIDetectionService(region);
    this.logger = new Logger({
      correlationId: 'sensitive-data-protection',
      operation: 'data-protection'
    });

    this.defaultPolicy = {
      policyId: 'default',
      autoMaskPII: true,
      allowedPIITypes: [],
      requireApprovalForSensitiveData: true,
      retentionPeriodDays: 90,
      encryptionRequired: true,
      auditAllAccess: true
    };
  }

  /**
   * Comprehensive scan for sensitive data in content
   */
  async scanContent(
    content: string,
    policy?: DataProtectionPolicy,
    languageCode: LanguageCode = LanguageCode.EN
  ): Promise<SensitiveDataScanResult> {
    const startTime = Date.now();
    const appliedPolicy = policy || this.defaultPolicy;

    this.logger.info('Starting sensitive data scan', {
      contentLength: content.length,
      policyId: appliedPolicy.policyId
    });

    try {
      // 1. Detect PII using AWS Comprehend
      const piiDetections = await this.piiDetectionService.detectPII(content, languageCode);

      // 2. Detect credentials and secrets
      const credentialDetections = this.detectCredentials(content);

      // 3. Detect financial information
      const financialDetections = this.detectFinancialData(content);

      // 4. Detect proprietary information
      const proprietaryDetections = this.detectProprietaryInfo(content);

      // 5. Categorize all detections
      const categories = this.categorizeDetections(
        piiDetections,
        credentialDetections,
        financialDetections,
        proprietaryDetections
      );

      // 6. Calculate sensitivity score
      const sensitivityScore = this.calculateSensitivityScore(categories);

      // 7. Mask sensitive data if policy requires
      let maskedContent = content;
      if (appliedPolicy.autoMaskPII) {
        maskedContent = await this.maskAllSensitiveData(
          content,
          piiDetections,
          credentialDetections,
          financialDetections
        );
      }

      const result: SensitiveDataScanResult = {
        hasSensitiveData: categories.length > 0,
        piiDetections,
        maskedContent,
        originalContent: content,
        sensitivityScore,
        detectionTimestamp: new Date().toISOString(),
        categories
      };

      const executionTime = Date.now() - startTime;
      this.logger.info('Sensitive data scan completed', {
        hasSensitiveData: result.hasSensitiveData,
        sensitivityScore,
        categoriesFound: categories.length,
        executionTimeMs: executionTime
      });

      return result;

    } catch (error) {
      this.logger.error('Sensitive data scan failed', error as Error);
      throw new Error(`Sensitive data scan failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect credentials and secrets in content
   */
  private detectCredentials(content: string): Array<{
    type: string;
    value: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    startOffset: number;
    endOffset: number;
  }> {
    const detections: Array<{
      type: string;
      value: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      startOffset: number;
      endOffset: number;
    }> = [];

    for (const pattern of this.credentialPatterns) {
      const matches = [...content.matchAll(pattern.pattern)];
      for (const match of matches) {
        if (match.index !== undefined) {
          detections.push({
            type: pattern.name,
            value: match[0],
            severity: pattern.severity,
            startOffset: match.index,
            endOffset: match.index + match[0].length
          });
        }
      }
    }

    return detections;
  }

  /**
   * Detect financial data in content
   */
  private detectFinancialData(content: string): Array<{
    type: string;
    value: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    startOffset: number;
    endOffset: number;
  }> {
    const detections: Array<{
      type: string;
      value: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      startOffset: number;
      endOffset: number;
    }> = [];

    for (const pattern of this.financialPatterns) {
      const matches = [...content.matchAll(pattern.pattern)];
      for (const match of matches) {
        if (match.index !== undefined) {
          // Additional validation to reduce false positives
          if (this.validateFinancialData(match[0], pattern.name)) {
            detections.push({
              type: pattern.name,
              value: match[0],
              severity: pattern.severity,
              startOffset: match.index,
              endOffset: match.index + match[0].length
            });
          }
        }
      }
    }

    return detections;
  }

  /**
   * Detect proprietary information markers
   */
  private detectProprietaryInfo(content: string): Array<{
    type: string;
    value: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    startOffset: number;
    endOffset: number;
  }> {
    const detections: Array<{
      type: string;
      value: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      startOffset: number;
      endOffset: number;
    }> = [];

    for (const pattern of this.proprietaryPatterns) {
      const matches = [...content.matchAll(pattern.pattern)];
      for (const match of matches) {
        if (match.index !== undefined) {
          detections.push({
            type: pattern.name,
            value: match[0],
            severity: pattern.severity,
            startOffset: match.index,
            endOffset: match.index + match[0].length
          });
        }
      }
    }

    return detections;
  }

  /**
   * Validate financial data to reduce false positives
   */
  private validateFinancialData(value: string, type: string): boolean {
    switch (type) {
      case 'Bank Account':
        // Bank accounts should be 8-17 digits, not just any number
        return /^\d{8,17}$/.test(value) && !this.isCommonNumber(value);
      
      case 'Routing Number':
        // Routing numbers are exactly 9 digits
        return /^\d{9}$/.test(value) && !this.isCommonNumber(value);
      
      case 'IBAN':
        // Basic IBAN validation
        return /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(value);
      
      default:
        return true;
    }
  }

  /**
   * Check if a number is a common/sequential number (likely false positive)
   */
  private isCommonNumber(value: string): boolean {
    // Check for sequential numbers
    const isSequential = /^(0123456789|1234567890|9876543210)/.test(value);
    
    // Check for repeated digits
    const isRepeated = /^(\d)\1+$/.test(value);
    
    // Check for common test numbers
    const commonNumbers = ['12345678', '123456789', '000000000', '111111111'];
    const isCommon = commonNumbers.includes(value);
    
    return isSequential || isRepeated || isCommon;
  }

  /**
   * Categorize all detections
   */
  private categorizeDetections(
    piiDetections: PIIDetection[],
    credentialDetections: any[],
    financialDetections: any[],
    proprietaryDetections: any[]
  ): SensitiveDataCategory[] {
    const categories: SensitiveDataCategory[] = [];

    // PII Category
    if (piiDetections.length > 0) {
      const maxSeverity = this.getMaxPIISeverity(piiDetections);
      categories.push({
        category: 'PII',
        count: piiDetections.length,
        severity: maxSeverity,
        items: piiDetections.map(d => `${d.type}: ${d.text}`)
      });
    }

    // Credentials Category
    if (credentialDetections.length > 0) {
      const maxSeverity = this.getMaxSeverity(credentialDetections);
      categories.push({
        category: 'CREDENTIALS',
        count: credentialDetections.length,
        severity: maxSeverity,
        items: credentialDetections.map(d => `${d.type}: [REDACTED]`)
      });
    }

    // Financial Category
    if (financialDetections.length > 0) {
      const maxSeverity = this.getMaxSeverity(financialDetections);
      categories.push({
        category: 'FINANCIAL',
        count: financialDetections.length,
        severity: maxSeverity,
        items: financialDetections.map(d => `${d.type}: [REDACTED]`)
      });
    }

    // Proprietary Category
    if (proprietaryDetections.length > 0) {
      const maxSeverity = this.getMaxSeverity(proprietaryDetections);
      categories.push({
        category: 'PROPRIETARY',
        count: proprietaryDetections.length,
        severity: maxSeverity,
        items: proprietaryDetections.map(d => `${d.type}`)
      });
    }

    return categories;
  }

  /**
   * Get maximum severity from PII detections
   */
  private getMaxPIISeverity(detections: PIIDetection[]): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: { [key: string]: number } = {
      'low': 1,
      'medium': 2,
      'high': 3,
      'critical': 4
    };

    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let maxSeverityValue = 0;

    for (const detection of detections) {
      const severity = this.getPIISeverity(detection.type);
      const severityValue = severityMap[severity];
      if (severityValue > maxSeverityValue) {
        maxSeverity = severity;
        maxSeverityValue = severityValue;
      }
    }

    return maxSeverity;
  }

  /**
   * Get severity for PII type
   */
  private getPIISeverity(piiType: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: { [key: string]: 'low' | 'medium' | 'high' | 'critical' } = {
      'SSN': 'critical',
      'CREDIT_CARD': 'critical',
      'EMAIL': 'medium',
      'PHONE': 'medium',
      'NAME': 'low',
      'ADDRESS': 'high'
    };

    return severityMap[piiType] || 'medium';
  }

  /**
   * Get maximum severity from generic detections
   */
  private getMaxSeverity(detections: any[]): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: { [key: string]: number } = {
      'low': 1,
      'medium': 2,
      'high': 3,
      'critical': 4
    };

    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let maxSeverityValue = 0;

    for (const detection of detections) {
      const severityValue = severityMap[detection.severity];
      if (severityValue > maxSeverityValue) {
        maxSeverity = detection.severity;
        maxSeverityValue = severityValue;
      }
    }

    return maxSeverity;
  }

  /**
   * Calculate overall sensitivity score
   */
  private calculateSensitivityScore(categories: SensitiveDataCategory[]): number {
    if (categories.length === 0) return 0;

    const severityWeights = {
      'low': 10,
      'medium': 25,
      'high': 50,
      'critical': 100
    };

    const categoryWeights = {
      'PII': 1.0,
      'CREDENTIALS': 1.5,
      'FINANCIAL': 1.3,
      'HEALTH': 1.4,
      'PROPRIETARY': 0.8
    };

    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const category of categories) {
      const severityScore = severityWeights[category.severity];
      const categoryWeight = categoryWeights[category.category];
      const itemScore = severityScore * categoryWeight * Math.min(category.count, 5);
      
      totalScore += itemScore;
      maxPossibleScore += 100 * categoryWeight * 5; // Max 5 items per category
    }

    // Normalize to 0-100 scale
    const normalizedScore = Math.min(100, (totalScore / maxPossibleScore) * 100);
    
    return Math.round(normalizedScore);
  }

  /**
   * Mask all sensitive data in content
   */
  private async maskAllSensitiveData(
    content: string,
    piiDetections: PIIDetection[],
    credentialDetections: any[],
    financialDetections: any[]
  ): Promise<string> {
    let maskedContent = content;

    // Combine all detections and sort by offset (descending)
    const allDetections = [
      ...piiDetections.map(d => ({ start: d.start_offset, end: d.end_offset, type: d.type })),
      ...credentialDetections.map(d => ({ start: d.startOffset, end: d.endOffset, type: d.type })),
      ...financialDetections.map(d => ({ start: d.startOffset, end: d.endOffset, type: d.type }))
    ].sort((a, b) => b.start - a.start);

    // Mask from end to start to preserve offsets
    for (const detection of allDetections) {
      const originalText = content.substring(detection.start, detection.end);
      const maskedValue = `[${detection.type}_REDACTED]`;
      
      maskedContent = 
        maskedContent.substring(0, detection.start) +
        maskedValue +
        maskedContent.substring(detection.end);
    }

    return maskedContent;
  }

  /**
   * Check if content requires approval based on sensitivity
   */
  shouldRequireApproval(scanResult: SensitiveDataScanResult, policy?: DataProtectionPolicy): boolean {
    const appliedPolicy = policy || this.defaultPolicy;

    if (!appliedPolicy.requireApprovalForSensitiveData) {
      return false;
    }

    // Require approval if sensitivity score is high
    if (scanResult.sensitivityScore >= 50) {
      return true;
    }

    // Require approval if critical categories are found
    const hasCriticalData = scanResult.categories.some(
      cat => cat.severity === 'critical' || cat.category === 'CREDENTIALS'
    );

    return hasCriticalData;
  }

  /**
   * Generate data protection report
   */
  generateProtectionReport(scanResult: SensitiveDataScanResult): string {
    const lines: string[] = [
      '=== Sensitive Data Protection Report ===',
      '',
      `Scan Timestamp: ${scanResult.detectionTimestamp}`,
      `Sensitivity Score: ${scanResult.sensitivityScore}/100`,
      `Has Sensitive Data: ${scanResult.hasSensitiveData ? 'Yes' : 'No'}`,
      '',
      'Categories Found:',
    ];

    if (scanResult.categories.length === 0) {
      lines.push('  No sensitive data detected');
    } else {
      for (const category of scanResult.categories) {
        lines.push(`  - ${category.category}: ${category.count} items (Severity: ${category.severity})`);
      }
    }

    lines.push('');
    lines.push('Recommendations:');

    if (scanResult.sensitivityScore >= 75) {
      lines.push('  - HIGH RISK: Review and remove sensitive data before submission');
      lines.push('  - Consider using references or placeholders instead of actual data');
      lines.push('  - Ensure proper encryption and access controls are in place');
    } else if (scanResult.sensitivityScore >= 50) {
      lines.push('  - MEDIUM RISK: Review sensitive data and ensure it is necessary');
      lines.push('  - Apply appropriate masking or redaction');
      lines.push('  - Limit access to authorized personnel only');
    } else if (scanResult.sensitivityScore > 0) {
      lines.push('  - LOW RISK: Monitor and audit access to this content');
      lines.push('  - Follow standard data protection procedures');
    } else {
      lines.push('  - No sensitive data detected');
      lines.push('  - Standard security practices apply');
    }

    return lines.join('\n');
  }
}
