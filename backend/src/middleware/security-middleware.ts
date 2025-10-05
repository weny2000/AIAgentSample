/**
 * Security Middleware
 * Integrates all security services for work task processing
 */

import { SensitiveDataProtectionService, SensitiveDataScanResult } from '../services/sensitive-data-protection-service';
import { FileSecurityScanner, FileScanResult } from '../services/file-security-scanner';
import { AccessControlService, AccessRequest, AccessDecision } from '../services/access-control-service';
import { EncryptionService } from '../services/encryption-service';
import { Logger } from '../lambda/utils/logger';

export interface SecurityContext {
  userId: string;
  userRoles: string[];
  teamId: string;
  sessionId?: string;
  sourceIp?: string;
  userAgent?: string;
}

export interface SecureWorkTaskContent {
  id: string;
  title: string;
  description: string;
  content: string;
  submittedBy: string;
  teamId: string;
  submittedAt: Date;
  priority: string;
  category?: string;
  tags?: string[];
  sensitivityScore?: number;
  securityMetadata?: {
    scanResult: SensitiveDataScanResult;
    requiresApproval: boolean;
    encryptedFields: string[];
  };
}

export interface SecureDeliverableUpload {
  fileName: string;
  fileSize: number;
  bucket: string;
  key: string;
  todoId: string;
  uploadedBy: string;
  teamId: string;
  scanResult?: FileScanResult;
}

export class SecurityMiddleware {
  private sensitiveDataService: SensitiveDataProtectionService;
  private fileScanner: FileSecurityScanner;
  private accessControl: AccessControlService;
  private encryption: EncryptionService;
  private logger: Logger;

  constructor(
    region: string = 'us-east-1',
    kmsKeyId?: string
  ) {
    this.sensitiveDataService = new SensitiveDataProtectionService(region);
    this.fileScanner = new FileSecurityScanner(region);
    this.accessControl = new AccessControlService();
    this.encryption = new EncryptionService(region, kmsKeyId);
    this.logger = new Logger({
      correlationId: 'security-middleware',
      operation: 'security-processing'
    });
  }

  /**
   * Process work task submission with security checks
   */
  async processWorkTaskSubmission(
    taskContent: any,
    securityContext: SecurityContext
  ): Promise<SecureWorkTaskContent> {
    this.logger.info('Processing work task submission with security checks', {
      taskId: taskContent.id,
      userId: securityContext.userId
    });

    try {
      // 1. Check access permissions
      await this.checkAccessPermission(
        securityContext,
        'work_task',
        taskContent.id,
        'create'
      );

      // 2. Scan content for sensitive data
      const scanResult = await this.sensitiveDataService.scanContent(
        `${taskContent.title}\n${taskContent.description}\n${taskContent.content}`
      );

      this.logger.info('Sensitive data scan completed', {
        taskId: taskContent.id,
        sensitivityScore: scanResult.sensitivityScore,
        hasSensitiveData: scanResult.hasSensitiveData
      });

      // 3. Check if approval is required
      const requiresApproval = this.sensitiveDataService.shouldRequireApproval(scanResult);

      if (requiresApproval) {
        this.logger.warn('Task requires approval due to sensitive data', {
          taskId: taskContent.id,
          sensitivityScore: scanResult.sensitivityScore
        });
      }

      // 4. Block if sensitivity score is too high
      if (scanResult.sensitivityScore > 90) {
        throw new Error(
          `Task contains critical sensitive data (score: ${scanResult.sensitivityScore}). ` +
          'Please remove sensitive information before submission.'
        );
      }

      // 5. Use masked content if sensitive data found
      let processedContent = taskContent.content;
      if (scanResult.hasSensitiveData && scanResult.sensitivityScore > 50) {
        processedContent = scanResult.maskedContent;
        this.logger.info('Using masked content for task', {
          taskId: taskContent.id
        });
      }

      // 6. Encrypt sensitive fields
      const encryptionContext = this.encryption.createEncryptionContext(
        'work_task',
        taskContent.id,
        securityContext.userId,
        securityContext.teamId
      );

      const encryptedContent = await this.encryption.encrypt(
        processedContent,
        undefined,
        encryptionContext
      );

      const encryptedDescription = await this.encryption.encrypt(
        taskContent.description,
        undefined,
        encryptionContext
      );

      // 7. Create secure task content
      const secureTask: SecureWorkTaskContent = {
        ...taskContent,
        content: encryptedContent.encryptedData,
        description: encryptedDescription.encryptedData,
        sensitivityScore: scanResult.sensitivityScore,
        securityMetadata: {
          scanResult,
          requiresApproval,
          encryptedFields: ['content', 'description']
        }
      };

      this.logger.info('Work task processed successfully with security', {
        taskId: taskContent.id,
        requiresApproval,
        sensitivityScore: scanResult.sensitivityScore
      });

      return secureTask;

    } catch (error) {
      this.logger.error('Failed to process work task with security', error as Error);
      throw error;
    }
  }

  /**
   * Process deliverable upload with security checks
   */
  async processDeliverableUpload(
    fileName: string,
    fileSize: number,
    bucket: string,
    key: string,
    todoId: string,
    securityContext: SecurityContext
  ): Promise<SecureDeliverableUpload> {
    this.logger.info('Processing deliverable upload with security checks', {
      fileName,
      fileSize,
      todoId,
      userId: securityContext.userId
    });

    try {
      // 1. Check access permissions
      await this.checkAccessPermission(
        securityContext,
        'deliverable',
        todoId,
        'create'
      );

      // 2. Quick validation before upload
      const quickCheck = await this.fileScanner.quickValidate(fileName, fileSize);
      
      if (!quickCheck.allowed) {
        throw new Error(`File validation failed: ${quickCheck.reason}`);
      }

      // 3. Full security scan after upload
      const scanResult = await this.fileScanner.scanFile(bucket, key);

      this.logger.info('File security scan completed', {
        fileName,
        scanStatus: scanResult.scanStatus,
        securityScore: scanResult.securityScore,
        threatsFound: scanResult.threatsFound.length
      });

      // 4. Handle scan results
      if (scanResult.scanStatus === 'infected') {
        this.logger.error('File infected - blocking upload', {
          fileName,
          threats: scanResult.threatsFound
        });
        throw new Error(
          'File contains malware or viruses and has been blocked. ' +
          'Please scan your system and try again with a clean file.'
        );
      }

      if (scanResult.scanStatus === 'suspicious') {
        this.logger.warn('File contains suspicious patterns', {
          fileName,
          threats: scanResult.threatsFound
        });
        // Allow but flag for manual review
      }

      // 5. Create secure deliverable record
      const secureDeliverable: SecureDeliverableUpload = {
        fileName,
        fileSize,
        bucket,
        key,
        todoId,
        uploadedBy: securityContext.userId,
        teamId: securityContext.teamId,
        scanResult
      };

      this.logger.info('Deliverable processed successfully with security', {
        fileName,
        scanStatus: scanResult.scanStatus,
        securityScore: scanResult.securityScore
      });

      return secureDeliverable;

    } catch (error) {
      this.logger.error('Failed to process deliverable with security', error as Error);
      throw error;
    }
  }

  /**
   * Decrypt work task content for authorized access
   */
  async decryptWorkTaskContent(
    encryptedTask: any,
    securityContext: SecurityContext
  ): Promise<any> {
    this.logger.info('Decrypting work task content', {
      taskId: encryptedTask.id,
      userId: securityContext.userId
    });

    try {
      // 1. Check access permissions
      await this.checkAccessPermission(
        securityContext,
        'work_task',
        encryptedTask.id,
        'read',
        encryptedTask.submittedBy
      );

      // 2. Create encryption context
      const encryptionContext = this.encryption.createEncryptionContext(
        'work_task',
        encryptedTask.id,
        encryptedTask.submittedBy,
        encryptedTask.teamId
      );

      // 3. Decrypt fields
      const decryptedContent = await this.encryption.decrypt(
        encryptedTask.content,
        encryptionContext
      );

      const decryptedDescription = await this.encryption.decrypt(
        encryptedTask.description,
        encryptionContext
      );

      // 4. Return decrypted task
      return {
        ...encryptedTask,
        content: decryptedContent.decryptedData,
        description: decryptedDescription.decryptedData
      };

    } catch (error) {
      this.logger.error('Failed to decrypt work task content', error as Error);
      throw error;
    }
  }

  /**
   * Check access permission
   */
  private async checkAccessPermission(
    securityContext: SecurityContext,
    resource: 'work_task' | 'deliverable' | 'todo_item' | 'quality_assessment',
    resourceId: string,
    action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'submit',
    resourceOwner?: string
  ): Promise<void> {
    const request: AccessRequest = {
      userId: securityContext.userId,
      userRoles: securityContext.userRoles,
      resource,
      resourceId,
      action,
      context: {
        teamId: securityContext.teamId,
        timestamp: new Date().toISOString(),
        sourceIp: securityContext.sourceIp,
        userAgent: securityContext.userAgent,
        sessionId: securityContext.sessionId,
        resourceOwner
      }
    };

    const decision = await this.accessControl.checkAccess(request);

    if (!decision.allowed) {
      this.logger.warn('Access denied', {
        userId: securityContext.userId,
        resource,
        action,
        reason: decision.reason
      });
      throw new Error(`Access denied: ${decision.reason}`);
    }

    this.logger.info('Access granted', {
      userId: securityContext.userId,
      resource,
      action
    });
  }

  /**
   * Generate security report for task
   */
  async generateSecurityReport(
    taskId: string,
    scanResult: SensitiveDataScanResult
  ): Promise<string> {
    return this.sensitiveDataService.generateProtectionReport(scanResult);
  }

  /**
   * Get audit log for user
   */
  getAuditLog(filters?: {
    userId?: string;
    resource?: 'work_task' | 'deliverable' | 'todo_item' | 'quality_assessment';
    startDate?: string;
    endDate?: string;
  }) {
    return this.accessControl.getAuditLog(filters);
  }

  /**
   * Add custom role
   */
  addCustomRole(role: any): void {
    this.accessControl.addRole(role);
  }

  /**
   * Get all roles
   */
  getAllRoles() {
    return this.accessControl.getAllRoles();
  }

  /**
   * Hash sensitive data (one-way)
   */
  hashSensitiveData(data: string): string {
    return this.encryption.hashData(data);
  }

  /**
   * Generate secure token
   */
  generateSecureToken(length: number = 32): string {
    return this.encryption.generateToken(length);
  }
}
