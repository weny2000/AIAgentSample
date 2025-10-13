import { QualityAssessmentEngine, QualityStandardConfig } from '../quality-assessment-engine';
import { DeliverableRecord, QualityAssessmentResult } from '../../models/work-task-models';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Mock dependencies
jest.mock('../../rules-engine/rules-engine-service');
jest.mock('../../lambda/utils/logger');

const s3Mock = mockClient(S3Client);

describe('QualityAssessmentEngine', () => {
  let engine: QualityAssessmentEngine;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;

  const mockDeliverable: DeliverableRecord = {
    deliverable_id: 'test-deliverable-1',
    todo_id: 'test-todo-1',
    file_name: 'test-file.ts',
    file_type: 'code',
    file_size: 1024,
    s3_key: 'deliverables/test-todo-1/test-deliverable-1/test-file.ts',
    submitted_by: 'test-user',
    submitted_at: '2024-01-01T00:00:00Z',
    status: 'submitted'
  };

  const mockTypeScriptContent = `
import { Logger } from './logger';

export class TestService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Process data with proper error handling
   */
  async processData(data: any): Promise<string> {
    try {
      if (!data) {
        throw new Error('Data is required');
      }
      
      // Process the data
      const result = this.transformData(data);
      this.logger.info('Data processed successfully');
      return result;
    } catch (error) {
      this.logger.error('Failed to process data', error);
      throw error;
    }
  }

  private transformData(data: any): string {
    return JSON.stringify(data);
  }
}
`;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    s3Mock.reset();

    // Mock RulesEngineService
    mockRulesEngine = {
      validateArtifact: jest.fn(),
      validateContent: jest.fn(),
      getInstance: jest.fn()
    } as any;

    (RulesEngineService.getInstance as jest.Mock).mockReturnValue(mockRulesEngine);

    // Mock S3 response
    s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
      Body: {
        transformToString: jest.fn().mockResolvedValue(mockTypeScriptContent)
      }
    });

    engine = new QualityAssessmentEngine();
  });

  describe('performQualityAssessment', () => {
    it('should perform comprehensive quality assessment for code files', async () => {
      // Mock rules engine responses
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 85,
        max_score: 100,
        passed: true,
        results: [
          {
            rule_name: 'typescript-lint',
            passed: true,
            severity: 'medium',
            message: 'TypeScript linting passed'
          }
        ],
        execution_time_ms: 100
      });

      mockRulesEngine.validateContent.mockResolvedValue({
        compliant: true,
        score: 0.9,
        violation: undefined
      });

      const result = await engine.performQualityAssessment(mockDeliverable, [], {
        teamId: 'test-team'
      });

      expect(result).toBeDefined();
      expect(result.overall_score).toBeGreaterThan(0);
      expect(result.quality_dimensions).toHaveLength(5); // format, completeness, accuracy, clarity, consistency
      expect(result.improvement_suggestions).toBeDefined();
      expect(result.compliance_status).toBeDefined();
      expect(result.assessed_at).toBeDefined();

      // Verify dimensions are present
      const dimensionNames = result.quality_dimensions.map(d => d.dimension);
      expect(dimensionNames).toContain('format');
      expect(dimensionNames).toContain('completeness');
      expect(dimensionNames).toContain('accuracy');
      expect(dimensionNames).toContain('clarity');
      expect(dimensionNames).toContain('consistency');
    });

    it('should handle document files with appropriate quality dimensions', async () => {
      const documentDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_name: 'README.md',
        file_type: 'document'
      };

      const documentContent = `
# Project Documentation

## Overview
This is a comprehensive guide for the project.

## Installation
Follow these steps to install:
1. Clone the repository
2. Run npm install
3. Configure environment variables

## Usage
The application provides the following features:
- Feature A: Does something important
- Feature B: Handles data processing
- Feature C: Manages user authentication

## Contributing
Please read our contributing guidelines before submitting pull requests.
`;

      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(documentContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 80,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 50
      });

      const result = await engine.performQualityAssessment(documentDeliverable);

      expect(result.overall_score).toBeGreaterThan(60);
      expect(result.quality_dimensions).toHaveLength(5);
      
      // Document should have good format and completeness scores
      const formatDimension = result.quality_dimensions.find(d => d.dimension === 'format');
      const completenessDimension = result.quality_dimensions.find(d => d.dimension === 'completeness');
      
      expect(formatDimension?.score).toBeGreaterThan(70);
      expect(completenessDimension?.score).toBeGreaterThan(70);
    });

    it('should handle test files with test-specific quality checks', async () => {
      const testDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_name: 'service.test.ts',
        file_type: 'test'
      };

      const testContent = `
import { TestService } from '../test-service';

describe('TestService', () => {
  let service: TestService;

  beforeEach(() => {
    service = new TestService();
  });

  describe('processData', () => {
    it('should process valid data successfully', async () => {
      const testData = { id: 1, name: 'test' };
      const result = await service.processData(testData);
      
      expect(result).toBeDefined();
      expect(result).toContain('test');
    });

    it('should throw error for null data', async () => {
      await expect(service.processData(null)).rejects.toThrow('Data is required');
    });

    it('should handle empty data', async () => {
      const result = await service.processData({});
      expect(result).toBe('{}');
    });
  });
});
`;

      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(testContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 90,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 75
      });

      const result = await engine.performQualityAssessment(testDeliverable);

      expect(result.overall_score).toBeGreaterThan(70);
      
      // Test files should have high completeness and accuracy scores
      const completenessDimension = result.quality_dimensions.find(d => d.dimension === 'completeness');
      const accuracyDimension = result.quality_dimensions.find(d => d.dimension === 'accuracy');
      
      expect(completenessDimension?.score).toBeGreaterThan(70);
      expect(accuracyDimension?.score).toBeGreaterThan(70);
    });

    it('should handle configuration files with appropriate validation', async () => {
      const configDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_name: 'config.json',
        file_type: 'configuration'
      };

      const configContent = `{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "testdb"
  },
  "api": {
    "baseUrl": "https://api.example.com",
    "timeout": 5000,
    "retries": 3
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}`;

      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(configContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 95,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 25
      });

      const result = await engine.performQualityAssessment(configDeliverable);

      expect(result.overall_score).toBeGreaterThan(80);
      
      // Configuration files should have high format and accuracy scores
      const formatDimension = result.quality_dimensions.find(d => d.dimension === 'format');
      const accuracyDimension = result.quality_dimensions.find(d => d.dimension === 'accuracy');
      
      expect(formatDimension?.score).toBeGreaterThan(85);
      expect(accuracyDimension?.score).toBeGreaterThan(80);
    });

    it('should generate appropriate improvement suggestions', async () => {
      const poorCodeContent = `
function badFunction(x) {
var result = x + 1
return result
}

function anotherBadFunction(y) {
console.log(y)
}
`;

      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(poorCodeContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 30,
        max_score: 100,
        passed: false,
        results: [
          {
            rule_name: 'no-var',
            passed: false,
            severity: 'medium',
            message: 'Use let or const instead of var'
          }
        ],
        execution_time_ms: 100
      });

      const result = await engine.performQualityAssessment(mockDeliverable);

      expect(result.overall_score).toBeLessThan(60);
      expect(result.improvement_suggestions.length).toBeGreaterThan(0);
      
      // Should suggest improvements for low-scoring dimensions
      const suggestions = result.improvement_suggestions.join(' ');
      expect(suggestions).toContain('Improve');
    });

    it('should check compliance status correctly', async () => {
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 60,
        max_score: 100,
        passed: false,
        results: [
          {
            rule_name: 'security-check',
            passed: false,
            severity: 'high',
            message: 'Security vulnerability detected',
            suggested_fix: 'Fix the security issue'
          }
        ],
        execution_time_ms: 150
      });

      const result = await engine.performQualityAssessment(
        mockDeliverable,
        ['security-standards', 'coding-standards']
      );

      expect(result.compliance_status.is_compliant).toBe(false);
      expect(result.compliance_status.standards_checked).toContain('security-standards');
      expect(result.compliance_status.standards_checked).toContain('coding-standards');
      expect(result.compliance_status.violations.length).toBeGreaterThan(0);
    });

    it('should handle assessment failures gracefully', async () => {
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).rejects(new Error('S3 access denied'));

      const result = await engine.performQualityAssessment(mockDeliverable);

      expect(result.overall_score).toBe(0);
      expect(result.improvement_suggestions).toContain('Quality assessment failed. Please review the deliverable and resubmit.');
      expect(result.compliance_status.is_compliant).toBe(false);
    });

    it('should handle rules engine failures gracefully', async () => {
      mockRulesEngine.validateArtifact.mockRejectedValue(new Error('Rules engine unavailable'));

      const result = await engine.performQualityAssessment(mockDeliverable);

      // Should still complete assessment with basic checks
      expect(result).toBeDefined();
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.quality_dimensions.length).toBeGreaterThan(0);
    });
  });

  describe('getAvailableQualityStandards', () => {
    it('should return quality standards for code files', () => {
      const standards = engine.getAvailableQualityStandards('code');
      
      expect(standards).toContain('security-standards');
      expect(standards).toContain('coding-standards');
      expect(standards).toContain('team-conventions');
    });

    it('should return quality standards for document files', () => {
      const standards = engine.getAvailableQualityStandards('document');
      
      expect(standards).toContain('documentation-standards');
      expect(standards).toContain('accessibility-standards');
    });

    it('should return quality standards for test files', () => {
      const standards = engine.getAvailableQualityStandards('test');
      
      expect(standards).toContain('testing-standards');
      expect(standards).toContain('code-quality-standards');
    });

    it('should return quality standards for configuration files', () => {
      const standards = engine.getAvailableQualityStandards('configuration');
      
      expect(standards).toContain('security-config-standards');
      expect(standards).toContain('infrastructure-standards');
    });
  });

  describe('getQualityDimensionConfig', () => {
    it('should return dimension configuration for code files', () => {
      const dimensions = engine.getQualityDimensionConfig('code');
      
      expect(dimensions).toHaveLength(5);
      expect(dimensions.map(d => d.dimension)).toContain('format');
      expect(dimensions.map(d => d.dimension)).toContain('completeness');
      expect(dimensions.map(d => d.dimension)).toContain('accuracy');
      expect(dimensions.map(d => d.dimension)).toContain('clarity');
      expect(dimensions.map(d => d.dimension)).toContain('consistency');
    });

    it('should return dimension configuration for document files', () => {
      const dimensions = engine.getQualityDimensionConfig('document');
      
      expect(dimensions).toHaveLength(5);
      
      // Document files should prioritize completeness and clarity
      const completenessDim = dimensions.find(d => d.dimension === 'completeness');
      const clarityDim = dimensions.find(d => d.dimension === 'clarity');
      
      expect(completenessDim?.weight).toBeGreaterThan(0.25);
      expect(clarityDim?.weight).toBeGreaterThan(0.2);
    });

    it('should return dimension configuration for test files', () => {
      const dimensions = engine.getQualityDimensionConfig('test');
      
      expect(dimensions).toHaveLength(5);
      
      // Test files should prioritize completeness and accuracy
      const completenessDim = dimensions.find(d => d.dimension === 'completeness');
      const accuracyDim = dimensions.find(d => d.dimension === 'accuracy');
      
      expect(completenessDim?.weight).toBeGreaterThan(0.3);
      expect(accuracyDim?.weight).toBeGreaterThan(0.25);
    });
  });

  describe('validateQualityStandardConfig', () => {
    it('should validate correct quality standard configuration', () => {
      const validConfig: QualityStandardConfig = {
        fileTypes: ['.ts', '.js'],
        dimensions: [
          {
            dimension: 'format',
            weight: 0.5,
            minimumScore: 70,
            checks: [
              {
                name: 'syntax',
                type: 'static_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          },
          {
            dimension: 'completeness',
            weight: 0.5,
            minimumScore: 60,
            checks: [
              {
                name: 'documentation',
                type: 'content_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          }
        ],
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.4,
          semanticValidation: 0.3,
          formatCompliance: 0.2,
          contentQuality: 0.1
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      const result = engine.validateQualityStandardConfig(validConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid dimension weights', () => {
      const invalidConfig: QualityStandardConfig = {
        fileTypes: ['.ts'],
        dimensions: [
          {
            dimension: 'format',
            weight: 0.7, // Invalid - doesn't sum to 1.0 with other dimensions
            minimumScore: 70,
            checks: [
              {
                name: 'syntax',
                type: 'static_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          },
          {
            dimension: 'completeness',
            weight: 0.5, // Total weight = 1.2, should be 1.0
            minimumScore: 60,
            checks: [
              {
                name: 'documentation',
                type: 'content_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          }
        ],
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.4,
          semanticValidation: 0.3,
          formatCompliance: 0.2,
          contentQuality: 0.1
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      const result = engine.validateQualityStandardConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Dimension weights must sum to 1.0'))).toBe(true);
    });

    it('should detect missing dimensions', () => {
      const invalidConfig: QualityStandardConfig = {
        fileTypes: ['.ts'],
        dimensions: [], // Empty dimensions array
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.4,
          semanticValidation: 0.3,
          formatCompliance: 0.2,
          contentQuality: 0.1
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      const result = engine.validateQualityStandardConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('must define at least one dimension'))).toBe(true);
    });

    it('should detect invalid scoring weights', () => {
      const invalidConfig: QualityStandardConfig = {
        fileTypes: ['.ts'],
        dimensions: [
          {
            dimension: 'format',
            weight: 1.0,
            minimumScore: 70,
            checks: [
              {
                name: 'syntax',
                type: 'static_analysis',
                weight: 1.0,
                config: {}
              }
            ]
          }
        ],
        complianceRules: ['coding-standards'],
        scoringWeights: {
          staticAnalysis: 0.5,
          semanticValidation: 0.3,
          formatCompliance: 0.3, // Total = 1.1, should be 1.0
          contentQuality: 0.0
        },
        improvementThresholds: {
          excellent: 90,
          good: 70,
          acceptable: 50,
          poor: 50
        }
      };

      const result = engine.validateQualityStandardConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Scoring weights must sum to 1.0'))).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty file content', async () => {
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue('')
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 0,
        max_score: 100,
        passed: false,
        results: [],
        execution_time_ms: 10
      });

      const result = await engine.performQualityAssessment(mockDeliverable);

      expect(result).toBeDefined();
      expect(result.overall_score).toBeLessThan(50);
    });

    it('should handle unknown file types', async () => {
      const unknownDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_name: 'unknown.xyz',
        file_type: 'unknown'
      };

      const result = await engine.performQualityAssessment(unknownDeliverable);

      expect(result).toBeDefined();
      // Should fall back to document standards
      expect(result.quality_dimensions).toHaveLength(5);
    });

    it('should handle very large files gracefully', async () => {
      const largeDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_size: 100 * 1024 * 1024 // 100MB
      };

      // Mock large content
      const largeContent = 'x'.repeat(1000000); // 1MB of content
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(largeContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 70,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 5000
      });

      const result = await engine.performQualityAssessment(largeDeliverable);

      expect(result).toBeDefined();
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
    });
  });
});