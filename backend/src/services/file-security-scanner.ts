/**
 * File Security Scanner Service
 * Virus detection, malware scanning, and file security validation for deliverables
 */

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '../lambda/utils/logger';
import * as crypto from 'crypto';

export interface FileScanResult {
  scanId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  scanTimestamp: string;
  scanStatus: 'clean' | 'infected' | 'suspicious' | 'error' | 'quarantined';
  threatsFound: ThreatDetail[];
  securityScore: number; // 0-100
  recommendations: string[];
  metadata: FileScanMetadata;
}

export interface ThreatDetail {
  threatId: string;
  threatName: string;
  threatType: 'virus' | 'malware' | 'trojan' | 'ransomware' | 'suspicious_pattern' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  remediation: string;
}

export interface FileScanMetadata {
  checksum: string;
  checksumAlgorithm: 'SHA256' | 'MD5';
  scannerVersion: string;
  signatureVersion: string;
  scanDurationMs: number;
  fileExtension: string;
  mimeType: string;
  isEncrypted: boolean;
  isCompressed: boolean;
}

export interface FileSecurityPolicy {
  allowedFileTypes: string[];
  blockedFileTypes: string[];
  maxFileSizeBytes: number;
  requireVirusScan: boolean;
  quarantineOnThreat: boolean;
  allowExecutables: boolean;
  allowScripts: boolean;
  allowArchives: boolean;
}

export class FileSecurityScanner {
  private s3Client: S3Client;
  private logger: Logger;
  private defaultPolicy: FileSecurityPolicy;

  // Dangerous file extensions
  private readonly dangerousExtensions = [
    '.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.pif',
    '.vbs', '.js', '.jar', '.app', '.deb', '.rpm',
    '.msi', '.dmg', '.pkg', '.sh', '.bash', '.ps1'
  ];

  // Suspicious patterns in file content
  private readonly suspiciousPatterns = [
    { name: 'Embedded Executable', pattern: /MZ\x90\x00/g, severity: 'high' as const },
    { name: 'PowerShell Command', pattern: /powershell\s+-(?:enc|e|encodedcommand)/gi, severity: 'high' as const },
    { name: 'Base64 Encoded Executable', pattern: /TVqQAAMAAAAEAAAA/g, severity: 'medium' as const },
    { name: 'Suspicious URL', pattern: /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/g, severity: 'medium' as const },
    { name: 'Obfuscated Code', pattern: /eval\s*\(\s*(?:atob|unescape|String\.fromCharCode)/gi, severity: 'high' as const },
    { name: 'SQL Injection Pattern', pattern: /(?:union|select|insert|update|delete|drop)\s+(?:all\s+)?(?:from|into|table)/gi, severity: 'medium' as const },
    { name: 'Command Injection', pattern: /[;&|]\s*(?:rm|del|format|wget|curl|nc|netcat)\s+/gi, severity: 'high' as const },
  ];

  // Known malicious file signatures (simplified - in production use proper AV engine)
  private readonly maliciousSignatures = [
    { name: 'EICAR Test File', signature: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', severity: 'critical' as const },
  ];

  constructor(region: string = 'us-east-1') {
    this.s3Client = new S3Client({ region });
    this.logger = new Logger({
      correlationId: 'file-security-scanner',
      operation: 'file-scanning'
    });

    this.defaultPolicy = {
      allowedFileTypes: [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
        '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.zip', '.tar', '.gz'
      ],
      blockedFileTypes: this.dangerousExtensions,
      maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
      requireVirusScan: true,
      quarantineOnThreat: true,
      allowExecutables: false,
      allowScripts: false,
      allowArchives: true
    };
  }

  /**
   * Scan a file from S3 for security threats
   */
  async scanFile(
    bucket: string,
    key: string,
    policy?: FileSecurityPolicy
  ): Promise<FileScanResult> {
    const startTime = Date.now();
    const scanId = this.generateScanId();
    const appliedPolicy = policy || this.defaultPolicy;

    this.logger.info('Starting file security scan', {
      scanId,
      bucket,
      key
    });

    try {
      // 1. Get file metadata
      const metadata = await this.getFileMetadata(bucket, key);

      // 2. Validate file type and size
      const typeValidation = this.validateFileType(metadata.fileExtension, appliedPolicy);
      if (!typeValidation.allowed) {
        return this.createBlockedResult(scanId, metadata, typeValidation.reason);
      }

      // 3. Check file size
      if (metadata.fileSize > appliedPolicy.maxFileSizeBytes) {
        return this.createBlockedResult(
          scanId,
          metadata,
          `File size ${metadata.fileSize} exceeds maximum allowed size ${appliedPolicy.maxFileSizeBytes}`
        );
      }

      // 4. Download and scan file content
      const fileContent = await this.downloadFile(bucket, key);
      
      // 5. Calculate checksum
      const checksum = this.calculateChecksum(fileContent);
      metadata.checksum = checksum;

      // 6. Scan for threats
      const threats: ThreatDetail[] = [];

      // Check for known malicious signatures
      const signatureThreats = this.scanForMaliciousSignatures(fileContent);
      threats.push(...signatureThreats);

      // Check for suspicious patterns
      const patternThreats = this.scanForSuspiciousPatterns(fileContent, metadata.fileExtension);
      threats.push(...patternThreats);

      // Check for embedded executables in archives
      if (this.isArchiveFile(metadata.fileExtension)) {
        const archiveThreats = await this.scanArchiveFile(fileContent, metadata.fileExtension);
        threats.push(...archiveThreats);
      }

      // 7. Determine scan status
      const scanStatus = this.determineScanStatus(threats);

      // 8. Calculate security score
      const securityScore = this.calculateSecurityScore(threats, metadata);

      // 9. Generate recommendations
      const recommendations = this.generateRecommendations(threats, metadata, appliedPolicy);

      const scanDurationMs = Date.now() - startTime;
      metadata.scanDurationMs = scanDurationMs;

      const result: FileScanResult = {
        scanId,
        fileName: this.extractFileName(key),
        fileSize: metadata.fileSize,
        fileType: metadata.fileExtension,
        scanTimestamp: new Date().toISOString(),
        scanStatus,
        threatsFound: threats,
        securityScore,
        recommendations,
        metadata: {
          ...metadata,
          scannerVersion: '1.0.0',
          signatureVersion: '2024.01'
        }
      };

      this.logger.info('File security scan completed', {
        scanId,
        scanStatus,
        threatsFound: threats.length,
        securityScore,
        scanDurationMs
      });

      return result;

    } catch (error) {
      this.logger.error('File security scan failed', error as Error, { scanId, bucket, key });
      
      return {
        scanId,
        fileName: this.extractFileName(key),
        fileSize: 0,
        fileType: 'unknown',
        scanTimestamp: new Date().toISOString(),
        scanStatus: 'error',
        threatsFound: [],
        securityScore: 0,
        recommendations: ['Scan failed - manual review required'],
        metadata: {
          checksum: '',
          checksumAlgorithm: 'SHA256',
          scannerVersion: '1.0.0',
          signatureVersion: '2024.01',
          scanDurationMs: Date.now() - startTime,
          fileExtension: '',
          mimeType: '',
          isEncrypted: false,
          isCompressed: false
        }
      };
    }
  }

  /**
   * Quick validation without full scan
   */
  async quickValidate(
    fileName: string,
    fileSize: number,
    policy?: FileSecurityPolicy
  ): Promise<{ allowed: boolean; reason?: string }> {
    const appliedPolicy = policy || this.defaultPolicy;
    const extension = this.extractFileExtension(fileName);

    // Check file type
    const typeValidation = this.validateFileType(extension, appliedPolicy);
    if (!typeValidation.allowed) {
      return typeValidation;
    }

    // Check file size
    if (fileSize > appliedPolicy.maxFileSizeBytes) {
      return {
        allowed: false,
        reason: `File size ${fileSize} exceeds maximum allowed size ${appliedPolicy.maxFileSizeBytes}`
      };
    }

    return { allowed: true };
  }

  /**
   * Get file metadata from S3
   */
  private async getFileMetadata(bucket: string, key: string): Promise<{
    fileSize: number;
    fileExtension: string;
    mimeType: string;
    isEncrypted: boolean;
    isCompressed: boolean;
    checksum: string;
    checksumAlgorithm: 'SHA256' | 'MD5';
    scanDurationMs: number;
    scannerVersion: string;
    signatureVersion: string;
  }> {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.s3Client.send(command);

    const fileExtension = this.extractFileExtension(key);
    const mimeType = response.ContentType || 'application/octet-stream';
    const isEncrypted = response.ServerSideEncryption !== undefined;
    const isCompressed = this.isCompressedFile(fileExtension);

    return {
      fileSize: response.ContentLength || 0,
      fileExtension,
      mimeType,
      isEncrypted,
      isCompressed,
      checksum: '',
      checksumAlgorithm: 'SHA256',
      scanDurationMs: 0,
      scannerVersion: '1.0.0',
      signatureVersion: '2024.01'
    };
  }

  /**
   * Download file from S3
   */
  private async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('File body is empty');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Validate file type against policy
   */
  private validateFileType(
    extension: string,
    policy: FileSecurityPolicy
  ): { allowed: boolean; reason?: string } {
    // Check if explicitly blocked
    if (policy.blockedFileTypes.includes(extension.toLowerCase())) {
      return {
        allowed: false,
        reason: `File type ${extension} is blocked by security policy`
      };
    }

    // Check if executable and not allowed
    if (!policy.allowExecutables && this.isExecutableFile(extension)) {
      return {
        allowed: false,
        reason: 'Executable files are not allowed'
      };
    }

    // Check if script and not allowed
    if (!policy.allowScripts && this.isScriptFile(extension)) {
      return {
        allowed: false,
        reason: 'Script files are not allowed'
      };
    }

    // Check if archive and not allowed
    if (!policy.allowArchives && this.isArchiveFile(extension)) {
      return {
        allowed: false,
        reason: 'Archive files are not allowed'
      };
    }

    // Check if in allowed list (if list is not empty)
    if (policy.allowedFileTypes.length > 0) {
      if (!policy.allowedFileTypes.includes(extension.toLowerCase())) {
        return {
          allowed: false,
          reason: `File type ${extension} is not in the allowed list`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Scan for known malicious signatures
   */
  private scanForMaliciousSignatures(content: Buffer): ThreatDetail[] {
    const threats: ThreatDetail[] = [];
    const contentStr = content.toString('utf-8', 0, Math.min(content.length, 10000)); // Check first 10KB

    for (const signature of this.maliciousSignatures) {
      if (contentStr.includes(signature.signature)) {
        threats.push({
          threatId: this.generateThreatId(),
          threatName: signature.name,
          threatType: 'virus',
          severity: signature.severity,
          description: `Known malicious signature detected: ${signature.name}`,
          remediation: 'Delete file immediately and scan system for infections'
        });
      }
    }

    return threats;
  }

  /**
   * Scan for suspicious patterns
   */
  private scanForSuspiciousPatterns(content: Buffer, fileExtension: string): ThreatDetail[] {
    const threats: ThreatDetail[] = [];
    
    // Only scan text-based files for patterns
    if (!this.isTextBasedFile(fileExtension)) {
      return threats;
    }

    const contentStr = content.toString('utf-8', 0, Math.min(content.length, 100000)); // Check first 100KB

    for (const pattern of this.suspiciousPatterns) {
      const matches = contentStr.match(pattern.pattern);
      if (matches && matches.length > 0) {
        threats.push({
          threatId: this.generateThreatId(),
          threatName: pattern.name,
          threatType: 'suspicious_pattern',
          severity: pattern.severity,
          description: `Suspicious pattern detected: ${pattern.name} (${matches.length} occurrences)`,
          location: `Found ${matches.length} times in file content`,
          remediation: 'Review file content and remove suspicious code'
        });
      }
    }

    return threats;
  }

  /**
   * Scan archive files for embedded threats
   */
  private async scanArchiveFile(content: Buffer, fileExtension: string): Promise<ThreatDetail[]> {
    const threats: ThreatDetail[] = [];

    // Check for nested executables in archives
    // This is a simplified check - in production, use proper archive parsing libraries
    const contentStr = content.toString('binary');
    
    // Check for PE executable headers (MZ signature)
    if (contentStr.includes('MZ\x90\x00')) {
      threats.push({
        threatId: this.generateThreatId(),
        threatName: 'Embedded Executable',
        threatType: 'suspicious_pattern',
        severity: 'high',
        description: 'Archive contains embedded executable files',
        location: 'Within archive',
        remediation: 'Extract and scan archive contents individually'
      });
    }

    return threats;
  }

  /**
   * Determine overall scan status
   */
  private determineScanStatus(threats: ThreatDetail[]): 'clean' | 'infected' | 'suspicious' | 'error' | 'quarantined' {
    if (threats.length === 0) {
      return 'clean';
    }

    const hasCritical = threats.some(t => t.severity === 'critical');
    const hasVirus = threats.some(t => t.threatType === 'virus' || t.threatType === 'malware');

    if (hasCritical || hasVirus) {
      return 'infected';
    }

    const hasHigh = threats.some(t => t.severity === 'high');
    if (hasHigh) {
      return 'suspicious';
    }

    return 'suspicious';
  }

  /**
   * Calculate security score
   */
  private calculateSecurityScore(threats: ThreatDetail[], metadata: any): number {
    let score = 100;

    const severityPenalties = {
      'low': 5,
      'medium': 15,
      'high': 30,
      'critical': 50
    };

    for (const threat of threats) {
      score -= severityPenalties[threat.severity];
    }

    // Additional penalties
    if (this.isExecutableFile(metadata.fileExtension)) {
      score -= 10;
    }

    if (!metadata.isEncrypted && this.shouldBeEncrypted(metadata.fileExtension)) {
      score -= 5;
    }

    return Math.max(0, score);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    threats: ThreatDetail[],
    metadata: any,
    policy: FileSecurityPolicy
  ): string[] {
    const recommendations: string[] = [];

    if (threats.length === 0) {
      recommendations.push('File passed all security checks');
      recommendations.push('Safe to process and store');
    } else {
      recommendations.push('Security threats detected - review required');
      
      const hasCritical = threats.some(t => t.severity === 'critical');
      if (hasCritical) {
        recommendations.push('CRITICAL: Do not open or execute this file');
        recommendations.push('Quarantine immediately and notify security team');
      }

      const hasHigh = threats.some(t => t.severity === 'high');
      if (hasHigh) {
        recommendations.push('HIGH RISK: Manual review required before processing');
      }

      // Specific recommendations based on threat types
      const hasVirus = threats.some(t => t.threatType === 'virus');
      if (hasVirus) {
        recommendations.push('Virus detected - delete file and scan system');
      }

      const hasSuspicious = threats.some(t => t.threatType === 'suspicious_pattern');
      if (hasSuspicious) {
        recommendations.push('Suspicious patterns found - verify file source and content');
      }
    }

    // General security recommendations
    if (!metadata.isEncrypted && this.shouldBeEncrypted(metadata.fileExtension)) {
      recommendations.push('Consider encrypting file at rest');
    }

    if (metadata.fileSize > 50 * 1024 * 1024) {
      recommendations.push('Large file - ensure adequate storage and bandwidth');
    }

    return recommendations;
  }

  // Helper methods
  private generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateThreatId(): string {
    return `threat_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private extractFileName(key: string): string {
    return key.split('/').pop() || key;
  }

  private extractFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : '';
  }

  private calculateChecksum(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private isExecutableFile(extension: string): boolean {
    return this.dangerousExtensions.includes(extension.toLowerCase());
  }

  private isScriptFile(extension: string): boolean {
    const scriptExtensions = ['.js', '.vbs', '.ps1', '.sh', '.bash', '.py', '.rb', '.pl'];
    return scriptExtensions.includes(extension.toLowerCase());
  }

  private isArchiveFile(extension: string): boolean {
    const archiveExtensions = ['.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.tgz'];
    return archiveExtensions.includes(extension.toLowerCase());
  }

  private isCompressedFile(extension: string): boolean {
    return this.isArchiveFile(extension);
  }

  private isTextBasedFile(extension: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv',
      '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.cs',
      '.html', '.css', '.sql', '.sh', '.bash', '.ps1'
    ];
    return textExtensions.includes(extension.toLowerCase());
  }

  private shouldBeEncrypted(extension: string): boolean {
    // Files that should typically be encrypted
    const sensitiveExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    return sensitiveExtensions.includes(extension.toLowerCase());
  }

  private createBlockedResult(scanId: string, metadata: any, reason: string): FileScanResult {
    return {
      scanId,
      fileName: '',
      fileSize: metadata.fileSize || 0,
      fileType: metadata.fileExtension || 'unknown',
      scanTimestamp: new Date().toISOString(),
      scanStatus: 'quarantined',
      threatsFound: [{
        threatId: this.generateThreatId(),
        threatName: 'Policy Violation',
        threatType: 'policy_violation',
        severity: 'high',
        description: reason,
        remediation: 'Use an allowed file type or contact administrator'
      }],
      securityScore: 0,
      recommendations: ['File blocked by security policy', reason],
      metadata: {
        ...metadata,
        scannerVersion: '1.0.0',
        signatureVersion: '2024.01'
      }
    };
  }
}
