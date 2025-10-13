/**
 * Tests for Security Middleware
 */

// Mock AWS SDK before imports
jest.mock('@aws-sdk/client-comprehend');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-kms');

// Mock PII Detection Service
jest.mock('../../ingestion/pii-detection', () => ({
  PIIDetectionService: jest.fn().mockImplementation(() => ({
    detectPII: jest.fn().mockResolvedValue([])
  }))
}));

import { SecurityMiddleware, SecurityContext } from '../security-middleware';
import { SensitiveDataProtectionService } from '../../services/sensitive-data-protection-service';
import { FileSecurityScanner } from '../../services/file-security-scanner';
import { AccessControlService } from '../../services/access-control-service';
import { EncryptionService } from '../../services/encryption-service';

// Mock all services
jest.mock('../../services/sensitive-data-protection-service');
jest.mock('../../services/file-security-scanner');
jest.mock('../../services/access-control-service');
jest.mock('../../services/encryption-service');

describe('SecurityMiddleware', () => {
  let middleware: SecurityMiddleware;
  let mockSensitiveDataService: jest.Mocked<SensitiveDataProtectionService>;
  let mockFileScanner: jest.Mocked<FileSecurityScanner>;
  let mockAccessControl: jest.Mocked<AccessControlService>;
  let mockEncryption: jest.Mocked<EncryptionService>;

  const mockSecurityContext: SecurityContext = {
    userId: 'user-123',
    userRoles: ['contributor'],
    teamId: 'team-456',
    sessionId: 'session-789'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    middleware = new SecurityMiddleware('us-east-1', 'test-key-id');
    
    mockSensitiveDataService = (middleware as any).sensitiveDataService;
    mockFileScanner = (middleware as any).fileScanner;
    mockAccessControl = (middleware as any).accessControl;
    mockEncryption = (middleware as any).encryption;
  });

  describe('processWorkTaskSubmission', () => {
    const mockTaskContent = {
      id: 'task-123',
      title: 'Test Task',
      description: 'Test description',
      content: 'Test content',
      submittedBy: 'user-123',
      teamId: 'team-456',
      submittedAt: new Date(),
      priority: 'medium'
    };

    it('should process task with low sensitivity successfully', async () => {
      // Mock access control
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      // Mock sensitive data scan
      mockSensitiveDataService.scanContent = jest.fn().mockResolvedValue({
        hasSensitiveData: false,
        piiDetections: [],
        maskedContent: mockTaskContent.content,
        originalContent: mockTaskContent.content,
        sensitivityScore: 10,
        detectionTimestamp: new Date().toISOString(),
        categories: []
      });

      mockSensitiveDataService.shouldRequireApproval = jest.fn().mockReturnValue(false);

      // Mock encryption
      mockEncryption.createEncryptionContext = jest.fn().mockReturnValue({
        resourceType: 'work_task',
        resourceId: 'task-123',
        userId: 'user-123',
        teamId: 'team-456',
        timestamp: new Date().toISOString()
      });

      mockEncryption.encrypt = jest.fn().mockResolvedValue({
        encryptedData: 'encrypted-content',
        keyId: 'test-key-id',
        algorithm: 'AES-256-GCM',
        timestamp: new Date().toISOString()
      });

      const result = await middleware.processWorkTaskSubmission(
        mockTaskContent,
        mockSecurityContext
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('task-123');
      expect(result.sensitivityScore).toBe(10);
      expect(result.securityMetadata?.requiresApproval).toBe(false);
      expect(result.securityMetadata?.encryptedFields).toContain('content');
      expect(result.securityMetadata?.encryptedFields).toContain('description');
    });

    it('should block task with critical sensitivity', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockSensitiveDataService.scanContent = jest.fn().mockResolvedValue({
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: mockTaskContent.content,
        originalContent: mockTaskContent.content,
        sensitivityScore: 95,
        detectionTimestamp: new Date().toISOString(),
        categories: [
          {
            category: 'CREDENTIALS' as const,
            count: 2,
            severity: 'critical' as const,
            items: ['AWS Key', 'Password']
          }
        ]
      });

      await expect(
        middleware.processWorkTaskSubmission(mockTaskContent, mockSecurityContext)
      ).rejects.toThrow('critical sensitive data');
    });

    it('should use masked content for medium-high sensitivity', async () => {
      const maskedContent = 'Test content with [EMAIL_REDACTED]';

      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockSensitiveDataService.scanContent = jest.fn().mockResolvedValue({
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent,
        originalContent: mockTaskContent.content,
        sensitivityScore: 60,
        detectionTimestamp: new Date().toISOString(),
        categories: [
          {
            category: 'PII' as const,
            count: 1,
            severity: 'medium' as const,
            items: ['Email']
          }
        ]
      });

      mockSensitiveDataService.shouldRequireApproval = jest.fn().mockReturnValue(true);

      mockEncryption.createEncryptionContext = jest.fn().mockReturnValue({});
      mockEncryption.encrypt = jest.fn().mockResolvedValue({
        encryptedData: 'encrypted-masked-content',
        keyId: 'test-key-id',
        algorithm: 'AES-256-GCM',
        timestamp: new Date().toISOString()
      });

      const result = await middleware.processWorkTaskSubmission(
        mockTaskContent,
        mockSecurityContext
      );

      expect(result.securityMetadata?.requiresApproval).toBe(true);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(
        maskedContent,
        undefined,
        expect.any(Object)
      );
    });

    it('should throw error when access is denied', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Insufficient permissions',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      await expect(
        middleware.processWorkTaskSubmission(mockTaskContent, mockSecurityContext)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('processDeliverableUpload', () => {
    const fileName = 'test-document.pdf';
    const fileSize = 1024 * 1024; // 1MB
    const bucket = 'test-bucket';
    const key = 'test-key';
    const todoId = 'todo-123';

    it('should process clean file successfully', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockFileScanner.quickValidate = jest.fn().mockResolvedValue({
        allowed: true
      });

      mockFileScanner.scanFile = jest.fn().mockResolvedValue({
        scanId: 'scan-123',
        fileName,
        fileSize,
        fileType: '.pdf',
        scanTimestamp: new Date().toISOString(),
        scanStatus: 'clean' as const,
        threatsFound: [],
        securityScore: 100,
        recommendations: ['File passed all security checks'],
        metadata: {
          checksum: 'abc123',
          checksumAlgorithm: 'SHA256' as const,
          scannerVersion: '1.0.0',
          signatureVersion: '2024.01',
          scanDurationMs: 100,
          fileExtension: '.pdf',
          mimeType: 'application/pdf',
          isEncrypted: false,
          isCompressed: false
        }
      });

      const result = await middleware.processDeliverableUpload(
        fileName,
        fileSize,
        bucket,
        key,
        todoId,
        mockSecurityContext
      );

      expect(result).toBeDefined();
      expect(result.fileName).toBe(fileName);
      expect(result.scanResult?.scanStatus).toBe('clean');
      expect(result.scanResult?.securityScore).toBe(100);
    });

    it('should block infected file', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockFileScanner.quickValidate = jest.fn().mockResolvedValue({
        allowed: true
      });

      mockFileScanner.scanFile = jest.fn().mockResolvedValue({
        scanId: 'scan-123',
        fileName,
        fileSize,
        fileType: '.pdf',
        scanTimestamp: new Date().toISOString(),
        scanStatus: 'infected' as const,
        threatsFound: [
          {
            threatId: 'threat-1',
            threatName: 'EICAR Test File',
            threatType: 'virus' as const,
            severity: 'critical' as const,
            description: 'Known test virus detected',
            remediation: 'Delete file immediately'
          }
        ],
        securityScore: 0,
        recommendations: ['File infected - quarantine immediately'],
        metadata: {
          checksum: 'abc123',
          checksumAlgorithm: 'SHA256' as const,
          scannerVersion: '1.0.0',
          signatureVersion: '2024.01',
          scanDurationMs: 100,
          fileExtension: '.pdf',
          mimeType: 'application/pdf',
          isEncrypted: false,
          isCompressed: false
        }
      });

      await expect(
        middleware.processDeliverableUpload(
          fileName,
          fileSize,
          bucket,
          key,
          todoId,
          mockSecurityContext
        )
      ).rejects.toThrow('malware or viruses');
    });

    it('should reject invalid file type', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockFileScanner.quickValidate = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'File type not allowed'
      });

      await expect(
        middleware.processDeliverableUpload(
          'malware.exe',
          fileSize,
          bucket,
          key,
          todoId,
          mockSecurityContext
        )
      ).rejects.toThrow('File validation failed');
    });
  });

  describe('decryptWorkTaskContent', () => {
    const encryptedTask = {
      id: 'task-123',
      title: 'Test Task',
      description: 'encrypted-description',
      content: 'encrypted-content',
      submittedBy: 'user-123',
      teamId: 'team-456'
    };

    it('should decrypt task content successfully', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Access granted',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      mockEncryption.createEncryptionContext = jest.fn().mockReturnValue({});
      
      mockEncryption.decrypt = jest.fn()
        .mockResolvedValueOnce({
          decryptedData: 'decrypted content',
          keyId: 'test-key-id',
          timestamp: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          decryptedData: 'decrypted description',
          keyId: 'test-key-id',
          timestamp: new Date().toISOString()
        });

      const result = await middleware.decryptWorkTaskContent(
        encryptedTask,
        mockSecurityContext
      );

      expect(result.content).toBe('decrypted content');
      expect(result.description).toBe('decrypted description');
    });

    it('should throw error when access is denied', async () => {
      mockAccessControl.checkAccess = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Cannot access other users tasks',
        appliedPolicies: [],
        appliedRoles: ['contributor'],
        conditions: []
      });

      await expect(
        middleware.decryptWorkTaskContent(encryptedTask, mockSecurityContext)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('utility methods', () => {
    it('should generate security report', async () => {
      const scanResult = {
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: '',
        originalContent: '',
        sensitivityScore: 50,
        detectionTimestamp: new Date().toISOString(),
        categories: []
      };

      mockSensitiveDataService.generateProtectionReport = jest.fn().mockReturnValue(
        'Security Report Content'
      );

      const report = await middleware.generateSecurityReport('task-123', scanResult);

      expect(report).toBe('Security Report Content');
      expect(mockSensitiveDataService.generateProtectionReport).toHaveBeenCalledWith(scanResult);
    });

    it('should get audit log', () => {
      const mockAuditLog = [
        {
          timestamp: new Date().toISOString(),
          userId: 'user-123',
          action: 'read' as const,
          resource: 'work_task' as const,
          resourceId: 'task-123',
          decision: 'allowed' as const,
          reason: 'Access granted',
          context: {
            teamId: 'team-456',
            timestamp: new Date().toISOString()
          }
        }
      ];

      mockAccessControl.getAuditLog = jest.fn().mockReturnValue(mockAuditLog);

      const log = middleware.getAuditLog({ userId: 'user-123' });

      expect(log).toEqual(mockAuditLog);
    });

    it('should add custom role', () => {
      const customRole = {
        roleId: 'custom-role',
        roleName: 'Custom Role',
        description: 'Test role',
        permissions: [],
        priority: 50
      };

      mockAccessControl.addRole = jest.fn();

      middleware.addCustomRole(customRole);

      expect(mockAccessControl.addRole).toHaveBeenCalledWith(customRole);
    });

    it('should get all roles', () => {
      const mockRoles = [
        {
          roleId: 'admin',
          roleName: 'Administrator',
          description: 'Full access',
          permissions: [],
          priority: 100
        }
      ];

      mockAccessControl.getAllRoles = jest.fn().mockReturnValue(mockRoles);

      const roles = middleware.getAllRoles();

      expect(roles).toEqual(mockRoles);
    });

    it('should hash sensitive data', () => {
      mockEncryption.hashData = jest.fn().mockReturnValue('hashed-value');

      const hash = middleware.hashSensitiveData('sensitive-data');

      expect(hash).toBe('hashed-value');
      expect(mockEncryption.hashData).toHaveBeenCalledWith('sensitive-data');
    });

    it('should generate secure token', () => {
      mockEncryption.generateToken = jest.fn().mockReturnValue('secure-token-123');

      const token = middleware.generateSecureToken(32);

      expect(token).toBe('secure-token-123');
      expect(mockEncryption.generateToken).toHaveBeenCalledWith(32);
    });
  });
});
