/**
 * Simple tests for QualityAssessmentEngine without AWS SDK dependencies
 * These tests focus on the core logic and configuration validation
 */

import { QualityStandardConfig } from '../quality-assessment-engine';

// Mock the AWS SDK and other dependencies to avoid import issues
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  GetObjectCommand: jest.fn()
}));

jest.mock('../../rules-engine/rules-engine-service', () => ({
  RulesEngineService: {
    getInstance: jest.fn(() => ({
      validateArtifact: jest.fn(),
      validateContent: jest.fn()
    }))
  }
}));

jest.mock('../../lambda/utils/logger', () => ({
  Logger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    performance: jest.fn()
  }))
}));

describe('QualityAssessmentEngine - Core Logic Tests', () => {
  let QualityAssessmentEngine: any;

  beforeAll(async () => {
    // Dynamically import after mocking dependencies
    const module = await import('../quality-assessment-engine');
    QualityAssessmentEngine = module.QualityAssessmentEngine;
  });

  describe('Configuration Management', () => {
    let engine: any;

    beforeEach(() => {
      engine = new QualityAssessmentEngine();
    });

    it('should return quality standards for code files', () => {
      const standards = engine.getAvailableQualityStandards('code');
      
      expect(Array.isArray(standards)).toBe(true);
      expect(standards.length).toBeGreaterThan(0);
      expect(standards).toContain('security-standards');
      expect(standards).toContain('coding-standards');
      expect(standards).toContain('team-conventions');
    });

    it('should return quality standards for document files', () => {
      const standards = engine.getAvailableQualityStandards('document');
      
      expect(Array.isArray(standards)).toBe(true);
      expect(standards).toContain('documentation-standards');
      expect(standards).toContain('accessibility-standards');
    });

    it('should return quality standards for test files', () => {
      const standards = engine.getAvailableQualityStandards('test');
      
      expect(Array.isArray(standards)).toBe(true);
      expect(standards).toContain('testing-standards');
      expect(standards).toContain('code-quality-standards');
    });

    it('should return quality standards for configuration files', () => {
      const standards = engine.getAvailableQualityStandards('configuration');
      
      expect(Array.isArray(standards)).toBe(true);
      expect(standards).toContain('security-config-standards');
      expect(standards).toContain('infrastructure-standards');
    });

    it('should return quality dimensions for code files', () => {
      const dimensions = engine.getQualityDimensionConfig('code');
      
      expect(Array.isArray(dimensions)).toBe(true);
      expect(dimensions).toHaveLength(5);
      
      const dimensionNames = dimensions.map((d: any) => d.dimension);
      expect(dimensionNames).toContain('format');
      expect(dimensionNames).toContain('completeness');
      expect(dimensionNames).toContain('accuracy');
      expect(dimensionNames).toContain('clarity');
      expect(dimensionNames).toContain('consistency');
    });

    it('should return quality dimensions for document files', () => {
      const dimensions = engine.getQualityDimensionConfig('document');
      
      expect(Array.isArray(dimensions)).toBe(true);
      expect(dimensions).toHaveLength(5);
      
      // Document files should prioritize completeness and clarity
      const completenessDim = dimensions.find((d: any) => d.dimension === 'completeness');
      const clarityDim = dimensions.find((d: any) => d.dimension === 'clarity');
      
      expect(completenessDim?.weight).toBeGreaterThan(0.25);
      expect(clarityDim?.weight).toBeGreaterThan(0.2);
    });

    it('should return quality dimensions for test files', () => {
      const dimensions = engine.getQualityDimensionConfig('test');
      
      expect(Array.isArray(dimensions)).toBe(true);
      expect(dimensions).toHaveLength(5);
      
      // Test files should prioritize completeness and accuracy
      const completenessDim = dimensions.find((d: any) => d.dimension === 'completeness');
      const accuracyDim = dimensions.find((d: any) => d.dimension === 'accuracy');
      
      expect(completenessDim?.weight).toBeGreaterThan(0.3);
      expect(accuracyDim?.weight).toBeGreaterThan(0.25);
    });

    it('should handle unknown file types by falling back to document standards', () => {
      const standards = engine.getAvailableQualityStandards('unknown-type');
      const dimensions = engine.getQualityDimensionConfig('unknown-type');
      
      expect(Array.isArray(standards)).toBe(true);
      expect(Array.isArray(dimensions)).toBe(true);
      expect(dimensions).toHaveLength(5);
    });
  });

  describe('Configuration Validation', () => {
    let engine: any;

    beforeEach(() => {
      engine = new QualityAssessmentEngine();
    });

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
      expect(result.errors.some((error: string) => error.includes('Dimension weights must sum to 1.0'))).toBe(true);
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
      expect(result.errors.some((error: string) => error.includes('must define at least one dimension'))).toBe(true);
    });

    it('should detect invalid check weights within dimensions', () => {
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
                weight: 0.6, // These don't sum to 1.0
                config: {}
              },
              {
                name: 'style',
                type: 'static_analysis',
                weight: 0.5, // Total = 1.1, should be 1.0
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
      expect(result.errors.some((error: string) => error.includes('check weights must sum to 1.0'))).toBe(true);
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
      expect(result.errors.some((error: string) => error.includes('Scoring weights must sum to 1.0'))).toBe(true);
    });

    it('should detect dimensions without checks', () => {
      const invalidConfig: QualityStandardConfig = {
        fileTypes: ['.ts'],
        dimensions: [
          {
            dimension: 'format',
            weight: 1.0,
            minimumScore: 70,
            checks: [] // Empty checks array
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
      expect(result.errors.some((error: string) => error.includes('must define at least one check'))).toBe(true);
    });
  });

  describe('Built-in Quality Standards', () => {
    let engine: any;

    beforeEach(() => {
      engine = new QualityAssessmentEngine();
    });

    it('should have valid built-in quality standards for all file types', () => {
      const fileTypes = ['code', 'document', 'test', 'configuration'];
      
      fileTypes.forEach(fileType => {
        const dimensions = engine.getQualityDimensionConfig(fileType);
        expect(dimensions).toHaveLength(5);
        
        // Verify dimension weights sum to 1.0
        const totalWeight = dimensions.reduce((sum: number, dim: any) => sum + dim.weight, 0);
        expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);
        
        // Verify each dimension has checks
        dimensions.forEach((dimension: any) => {
          expect(dimension.checks.length).toBeGreaterThan(0);
          
          // Verify check weights sum to 1.0
          const checkWeightSum = dimension.checks.reduce((sum: number, check: any) => sum + check.weight, 0);
          expect(Math.abs(checkWeightSum - 1.0)).toBeLessThan(0.01);
        });
      });
    });

    it('should have appropriate quality standards for each file type', () => {
      // Code files should emphasize static analysis and security
      const codeStandards = engine.getAvailableQualityStandards('code');
      expect(codeStandards).toContain('security-standards');
      expect(codeStandards).toContain('coding-standards');
      
      // Document files should emphasize documentation and accessibility
      const docStandards = engine.getAvailableQualityStandards('document');
      expect(docStandards).toContain('documentation-standards');
      expect(docStandards).toContain('accessibility-standards');
      
      // Test files should emphasize testing standards
      const testStandards = engine.getAvailableQualityStandards('test');
      expect(testStandards).toContain('testing-standards');
      expect(testStandards).toContain('code-quality-standards');
      
      // Configuration files should emphasize security and infrastructure
      const configStandards = engine.getAvailableQualityStandards('configuration');
      expect(configStandards).toContain('security-config-standards');
      expect(configStandards).toContain('infrastructure-standards');
    });

    it('should have appropriate dimension priorities for each file type', () => {
      // Code files should prioritize completeness and accuracy
      const codeDimensions = engine.getQualityDimensionConfig('code');
      const codeCompleteness = codeDimensions.find((d: any) => d.dimension === 'completeness');
      const codeAccuracy = codeDimensions.find((d: any) => d.dimension === 'accuracy');
      expect(codeCompleteness?.weight).toBeGreaterThan(0.2);
      expect(codeAccuracy?.weight).toBeGreaterThan(0.2);
      
      // Test files should heavily prioritize completeness and accuracy
      const testDimensions = engine.getQualityDimensionConfig('test');
      const testCompleteness = testDimensions.find((d: any) => d.dimension === 'completeness');
      const testAccuracy = testDimensions.find((d: any) => d.dimension === 'accuracy');
      expect(testCompleteness?.weight).toBeGreaterThan(0.3);
      expect(testAccuracy?.weight).toBeGreaterThan(0.25);
      
      // Configuration files should prioritize format and accuracy
      const configDimensions = engine.getQualityDimensionConfig('configuration');
      const configFormat = configDimensions.find((d: any) => d.dimension === 'format');
      const configAccuracy = configDimensions.find((d: any) => d.dimension === 'accuracy');
      expect(configFormat?.weight).toBeGreaterThan(0.35);
      expect(configAccuracy?.weight).toBeGreaterThan(0.25);
    });
  });

  describe('Error Handling', () => {
    let engine: any;

    beforeEach(() => {
      engine = new QualityAssessmentEngine();
    });

    it('should handle null or undefined file types gracefully', () => {
      expect(() => engine.getAvailableQualityStandards(null)).not.toThrow();
      expect(() => engine.getAvailableQualityStandards(undefined)).not.toThrow();
      expect(() => engine.getQualityDimensionConfig(null)).not.toThrow();
      expect(() => engine.getQualityDimensionConfig(undefined)).not.toThrow();
    });

    it('should handle empty string file types gracefully', () => {
      expect(() => engine.getAvailableQualityStandards('')).not.toThrow();
      expect(() => engine.getQualityDimensionConfig('')).not.toThrow();
    });

    it('should handle malformed configuration objects gracefully', () => {
      const malformedConfig = {
        // Missing required fields
        fileTypes: null,
        dimensions: undefined
      };

      expect(() => engine.validateQualityStandardConfig(malformedConfig)).not.toThrow();
      
      const result = engine.validateQualityStandardConfig(malformedConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});