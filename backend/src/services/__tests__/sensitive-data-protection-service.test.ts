/**
 * Tests for Sensitive Data Protection Service
 */

import { SensitiveDataProtectionService } from '../sensitive-data-protection-service';
import { PIIDetectionService } from '../../ingestion/pii-detection';
import { LanguageCode } from '@aws-sdk/client-comprehend';

// Mock PIIDetectionService
jest.mock('../../ingestion/pii-detection');

describe('SensitiveDataProtectionService', () => {
  let service: SensitiveDataProtectionService;
  let mockPIIService: jest.Mocked<PIIDetectionService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SensitiveDataProtectionService('us-east-1');
    mockPIIService = (service as any).piiDetectionService;
  });

  describe('scanContent', () => {
    it('should detect PII in content', async () => {
      const content = 'My email is john.doe@example.com and phone is 555-1234';

      mockPIIService.detectPII = jest.fn().mockResolvedValue([
        {
          type: 'EMAIL',
          text: 'john.doe@example.com',
          confidence: 0.95,
          start_offset: 12,
          end_offset: 33,
          masked_text: 'jo**************om'
        },
        {
          type: 'PHONE',
          text: '555-1234',
          confidence: 0.90,
          start_offset: 47,
          end_offset: 55,
          masked_text: '****1234'
        }
      ]);

      const result = await service.scanContent(content);

      expect(result.hasSensitiveData).toBe(true);
      expect(result.piiDetections).toHaveLength(2);
      expect(result.sensitivityScore).toBeGreaterThan(0);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].category).toBe('PII');
    });

    it('should detect credentials in content', async () => {
      const content = 'AWS Key: AKIAIOSFODNN7EXAMPLE and password=MySecretPassword123';

      mockPIIService.detectPII = jest.fn().mockResolvedValue([]);

      const result = await service.scanContent(content);

      expect(result.hasSensitiveData).toBe(true);
      expect(result.categories.some(c => c.category === 'CREDENTIALS')).toBe(true);
      expect(result.sensitivityScore).toBeGreaterThan(50);
    });

    it('should detect financial data', async () => {
      const content = 'Bank account: 123456789012 and routing: 021000021';

      mockPIIService.detectPII = jest.fn().mockResolvedValue([]);

      const result = await service.scanContent(content);

      expect(result.hasSensitiveData).toBe(true);
      expect(result.categories.some(c => c.category === 'FINANCIAL')).toBe(true);
    });

    it('should return clean result for non-sensitive content', async () => {
      const content = 'This is a regular work task description without sensitive data';

      mockPIIService.detectPII = jest.fn().mockResolvedValue([]);

      const result = await service.scanContent(content);

      expect(result.hasSensitiveData).toBe(false);
      expect(result.sensitivityScore).toBe(0);
      expect(result.categories).toHaveLength(0);
    });

    it('should mask sensitive data when policy requires', async () => {
      const content = 'Email: test@example.com';

      mockPIIService.detectPII = jest.fn().mockResolvedValue([
        {
          type: 'EMAIL',
          text: 'test@example.com',
          confidence: 0.95,
          start_offset: 7,
          end_offset: 23,
          masked_text: 'te**@example.com'
        }
      ]);

      const policy = {
        policyId: 'test-policy',
        autoMaskPII: true,
        allowedPIITypes: [],
        requireApprovalForSensitiveData: false,
        retentionPeriodDays: 90,
        encryptionRequired: true,
        auditAllAccess: true
      };

      const result = await service.scanContent(content, policy);

      expect(result.maskedContent).not.toBe(content);
      expect(result.maskedContent).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('shouldRequireApproval', () => {
    it('should require approval for high sensitivity score', () => {
      const scanResult = {
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: '',
        originalContent: '',
        sensitivityScore: 75,
        detectionTimestamp: new Date().toISOString(),
        categories: []
      };

      const result = service.shouldRequireApproval(scanResult);

      expect(result).toBe(true);
    });

    it('should require approval for critical data', () => {
      const scanResult = {
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: '',
        originalContent: '',
        sensitivityScore: 30,
        detectionTimestamp: new Date().toISOString(),
        categories: [
          {
            category: 'CREDENTIALS' as const,
            count: 1,
            severity: 'critical' as const,
            items: ['AWS Key']
          }
        ]
      };

      const result = service.shouldRequireApproval(scanResult);

      expect(result).toBe(true);
    });

    it('should not require approval for low sensitivity', () => {
      const scanResult = {
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: '',
        originalContent: '',
        sensitivityScore: 20,
        detectionTimestamp: new Date().toISOString(),
        categories: [
          {
            category: 'PII' as const,
            count: 1,
            severity: 'low' as const,
            items: ['Name']
          }
        ]
      };

      const result = service.shouldRequireApproval(scanResult);

      expect(result).toBe(false);
    });
  });

  describe('generateProtectionReport', () => {
    it('should generate comprehensive report', () => {
      const scanResult = {
        hasSensitiveData: true,
        piiDetections: [],
        maskedContent: '',
        originalContent: '',
        sensitivityScore: 65,
        detectionTimestamp: new Date().toISOString(),
        categories: [
          {
            category: 'PII' as const,
            count: 2,
            severity: 'medium' as const,
            items: ['Email', 'Phone']
          },
          {
            category: 'CREDENTIALS' as const,
            count: 1,
            severity: 'high' as const,
            items: ['API Key']
          }
        ]
      };

      const report = service.generateProtectionReport(scanResult);

      expect(report).toContain('Sensitive Data Protection Report');
      expect(report).toContain('Sensitivity Score: 65/100');
      expect(report).toContain('PII: 2 items');
      expect(report).toContain('CREDENTIALS: 1 items');
      expect(report).toContain('MEDIUM RISK');
    });
  });
});
