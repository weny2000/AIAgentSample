import { QualityAssessmentEngine } from '../quality-assessment-engine';
import { ArtifactValidationService } from '../artifact-validation-service';
import { DeliverableRecord, QualityAssessmentResult, ValidationResult } from '../../models/work-task-models';
import { RulesEngineService } from '../../rules-engine/rules-engine-service';
import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Mock dependencies
jest.mock('../../rules-engine/rules-engine-service');
jest.mock('../../lambda/utils/logger');

const s3Mock = mockClient(S3Client);

describe('QualityAssessmentEngine Integration Tests', () => {
  let qualityEngine: QualityAssessmentEngine;
  let validationService: ArtifactValidationService;
  let mockRulesEngine: jest.Mocked<RulesEngineService>;

  const mockDeliverable: DeliverableRecord = {
    deliverable_id: 'integration-test-deliverable',
    todo_id: 'integration-test-todo',
    file_name: 'integration-test.ts',
    file_type: 'code',
    file_size: 2048,
    s3_key: 'deliverables/integration-test-todo/integration-test-deliverable/integration-test.ts',
    submitted_by: 'integration-test-user',
    submitted_at: '2024-01-01T00:00:00Z',
    status: 'submitted'
  };

  const sampleTypeScriptCode = `
import { Logger } from '../utils/logger';
import { DatabaseService } from '../services/database-service';

/**
 * Service for managing user data operations
 */
export class UserService {
  private logger: Logger;
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.logger = new Logger('UserService');
    this.dbService = dbService;
  }

  /**
   * Retrieve user by ID with proper error handling
   * @param userId - The unique identifier for the user
   * @returns Promise resolving to user data or null if not found
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      if (!userId || userId.trim().length === 0) {
        throw new Error('User ID is required');
      }

      this.logger.info('Retrieving user', { userId });
      
      const user = await this.dbService.findUserById(userId);
      
      if (!user) {
        this.logger.warn('User not found', { userId });
        return null;
      }

      this.logger.info('User retrieved successfully', { userId });
      return user;
    } catch (error) {
      this.logger.error('Failed to retrieve user', error, { userId });
      throw error;
    }
  }

  /**
   * Create a new user with validation
   * @param userData - The user data to create
   * @returns Promise resolving to created user
   */
  async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      // Validate required fields
      if (!userData.email || !userData.name) {
        throw new Error('Email and name are required');
      }

      // Check if user already exists
      const existingUser = await this.dbService.findUserByEmail(userData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      this.logger.info('Creating new user', { email: userData.email });
      
      const user = await this.dbService.createUser(userData);
      
      this.logger.info('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', error, { email: userData.email });
      throw error;
    }
  }

  /**
   * Update user information
   * @param userId - The user ID to update
   * @param updates - The fields to update
   * @returns Promise resolving to updated user
   */
  async updateUser(userId: string, updates: UpdateUserRequest): Promise<User> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Verify user exists
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      this.logger.info('Updating user', { userId, updates });
      
      const updatedUser = await this.dbService.updateUser(userId, updates);
      
      this.logger.info('User updated successfully', { userId });
      return updatedUser;
    } catch (error) {
      this.logger.error('Failed to update user', error, { userId });
      throw error;
    }
  }

  /**
   * Delete user by ID
   * @param userId - The user ID to delete
   * @returns Promise resolving to boolean indicating success
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Verify user exists
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn('Attempted to delete non-existent user', { userId });
        return false;
      }

      this.logger.info('Deleting user', { userId });
      
      await this.dbService.deleteUser(userId);
      
      this.logger.info('User deleted successfully', { userId });
      return true;
    } catch (error) {
      this.logger.error('Failed to delete user', error, { userId });
      throw error;
    }
  }
}

// Type definitions
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUserRequest {
  email: string;
  name: string;
  metadata?: Record<string, any>;
}

interface UpdateUserRequest {
  name?: string;
  metadata?: Record<string, any>;
}
`;

  beforeEach(() => {
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
        transformToString: jest.fn().mockResolvedValue(sampleTypeScriptCode)
      }
    });

    qualityEngine = new QualityAssessmentEngine();
    validationService = new ArtifactValidationService();
  });

  describe('Integration with ArtifactValidationService', () => {
    it('should perform quality assessment using validation results', async () => {
      // Mock rules engine for validation service
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 85,
        max_score: 100,
        passed: true,
        results: [
          {
            rule_name: 'typescript-eslint',
            passed: true,
            severity: 'medium',
            message: 'TypeScript ESLint validation passed'
          },
          {
            rule_name: 'security-check',
            passed: true,
            severity: 'high',
            message: 'No security vulnerabilities found'
          }
        ],
        execution_time_ms: 150
      });

      // First, perform validation
      const validationResult: ValidationResult = await validationService.validateDeliverable(
        mockDeliverable.todo_id,
        mockDeliverable
      );

      expect(validationResult.is_valid).toBe(true);
      expect(validationResult.validation_score).toBeGreaterThan(0.7);

      // Then, perform quality assessment with validation context
      const qualityResult: QualityAssessmentResult = await qualityEngine.performQualityAssessment(
        mockDeliverable,
        ['security-standards', 'coding-standards'],
        {
          validationResult,
          teamId: 'integration-test-team'
        }
      );

      expect(qualityResult.overall_score).toBeGreaterThan(70);
      expect(qualityResult.quality_dimensions).toHaveLength(5);
      expect(qualityResult.compliance_status.is_compliant).toBe(true);

      // Verify that quality assessment leveraged validation results
      expect(qualityResult.improvement_suggestions.length).toBeLessThan(3); // Good code should have few suggestions
    });

    it('should handle poor quality code with comprehensive feedback', async () => {
      const poorCodeContent = `
var x = 1;
function bad() {
console.log("no error handling");
var y = null;
y.someProperty;
}

function another() {
// TODO: implement this
}

var password = "hardcoded123";
`;

      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(poorCodeContent)
        }
      });

      // Mock rules engine to return poor validation results
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 25,
        max_score: 100,
        passed: false,
        results: [
          {
            rule_name: 'no-var',
            passed: false,
            severity: 'medium',
            message: 'Use let or const instead of var',
            suggested_fix: 'Replace var with let or const'
          },
          {
            rule_name: 'no-hardcoded-secrets',
            passed: false,
            severity: 'critical',
            message: 'Hardcoded password detected',
            suggested_fix: 'Use environment variables for sensitive data'
          },
          {
            rule_name: 'error-handling',
            passed: false,
            severity: 'high',
            message: 'Missing error handling',
            suggested_fix: 'Add try-catch blocks'
          }
        ],
        execution_time_ms: 200
      });

      // Perform validation first
      const validationResult = await validationService.validateDeliverable(
        mockDeliverable.todo_id,
        mockDeliverable
      );

      expect(validationResult.is_valid).toBe(false);
      expect(validationResult.validation_score).toBeLessThan(0.5);

      // Perform quality assessment
      const qualityResult = await qualityEngine.performQualityAssessment(
        mockDeliverable,
        ['security-standards', 'coding-standards'],
        {
          validationResult,
          teamId: 'integration-test-team'
        }
      );

      expect(qualityResult.overall_score).toBeLessThan(50);
      expect(qualityResult.improvement_suggestions.length).toBeGreaterThan(3);
      expect(qualityResult.compliance_status.is_compliant).toBe(false);
      expect(qualityResult.compliance_status.violations.length).toBeGreaterThan(0);

      // Verify specific issues are identified
      const suggestions = qualityResult.improvement_suggestions.join(' ');
      expect(suggestions.toLowerCase()).toContain('improve');
      
      const violations = qualityResult.compliance_status.violations;
      expect(violations.some(v => v.severity === 'critical')).toBe(true);
    });

    it('should handle different file types with appropriate quality standards', async () => {
      const testCases = [
        {
          fileType: 'document',
          fileName: 'README.md',
          content: `# Project Title\n\nThis is a comprehensive documentation.\n\n## Features\n- Feature 1\n- Feature 2\n\n## Installation\nRun npm install`,
          expectedMinScore: 60
        },
        {
          fileType: 'test',
          fileName: 'service.test.ts',
          content: `describe('Service', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});`,
          expectedMinScore: 50
        },
        {
          fileType: 'configuration',
          fileName: 'config.json',
          content: `{"database": {"host": "localhost", "port": 5432}, "api": {"timeout": 5000}}`,
          expectedMinScore: 80
        }
      ];

      for (const testCase of testCases) {
        const deliverable: DeliverableRecord = {
          ...mockDeliverable,
          deliverable_id: `test-${testCase.fileType}`,
          file_name: testCase.fileName,
          file_type: testCase.fileType
        };

        s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
          Body: {
            transformToString: jest.fn().mockResolvedValue(testCase.content)
          }
        });

        mockRulesEngine.validateArtifact.mockResolvedValue({
          overall_score: 80,
          max_score: 100,
          passed: true,
          results: [],
          execution_time_ms: 100
        });

        const validationResult = await validationService.validateDeliverable(
          deliverable.todo_id,
          deliverable
        );

        const qualityResult = await qualityEngine.performQualityAssessment(
          deliverable,
          [],
          { validationResult }
        );

        expect(qualityResult.overall_score).toBeGreaterThan(testCase.expectedMinScore);
        expect(qualityResult.quality_dimensions).toHaveLength(5);
        
        // Verify file-type specific quality standards are applied
        const availableStandards = qualityEngine.getAvailableQualityStandards(testCase.fileType);
        expect(availableStandards.length).toBeGreaterThan(0);
      }
    });

    it('should provide consistent results across multiple assessments', async () => {
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 75,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 120
      });

      // Perform multiple assessments of the same deliverable
      const results: QualityAssessmentResult[] = [];
      
      for (let i = 0; i < 3; i++) {
        const result = await qualityEngine.performQualityAssessment(
          mockDeliverable,
          ['coding-standards'],
          { teamId: 'consistency-test-team' }
        );
        results.push(result);
      }

      // Verify consistency
      const scores = results.map(r => r.overall_score);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      
      // Scores should be within 5 points of each other
      expect(maxScore - minScore).toBeLessThanOrEqual(5);

      // All results should have the same number of dimensions
      results.forEach(result => {
        expect(result.quality_dimensions).toHaveLength(5);
        expect(result.compliance_status.standards_checked).toContain('coding-standards');
      });
    });

    it('should handle concurrent quality assessments', async () => {
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 80,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 100
      });

      // Create multiple deliverables for concurrent assessment
      const deliverables = Array.from({ length: 5 }, (_, i) => ({
        ...mockDeliverable,
        deliverable_id: `concurrent-test-${i}`,
        file_name: `test-file-${i}.ts`
      }));

      // Perform concurrent assessments
      const assessmentPromises = deliverables.map(deliverable =>
        qualityEngine.performQualityAssessment(
          deliverable,
          ['coding-standards'],
          { teamId: 'concurrent-test-team' }
        )
      );

      const results = await Promise.all(assessmentPromises);

      // Verify all assessments completed successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.overall_score).toBeGreaterThan(0);
        expect(result.quality_dimensions).toHaveLength(5);
        expect(result.assessed_at).toBeDefined();
      });
    });

    it('should integrate with rules engine for semantic validation', async () => {
      mockRulesEngine.validateContent.mockResolvedValue({
        compliant: false,
        score: 0.6,
        violation: 'Content contains prohibited terms'
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 70,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 150
      });

      const result = await qualityEngine.performQualityAssessment(
        mockDeliverable,
        ['team-conventions'],
        { teamId: 'semantic-test-team' }
      );

      // Verify semantic validation was performed
      expect(mockRulesEngine.validateContent).toHaveBeenCalledWith(
        sampleTypeScriptCode,
        'semantic-test-team'
      );

      // Quality score should reflect semantic validation results
      expect(result.overall_score).toBeLessThan(80); // Should be reduced due to semantic issues
      
      // Should have improvement suggestions related to semantic issues
      const suggestions = result.improvement_suggestions.join(' ');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle S3 failures gracefully', async () => {
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).rejects(new Error('S3 service unavailable'));

      const result = await qualityEngine.performQualityAssessment(mockDeliverable);

      expect(result.overall_score).toBe(0);
      expect(result.improvement_suggestions).toContain('Quality assessment failed. Please review the deliverable and resubmit.');
      expect(result.compliance_status.is_compliant).toBe(false);
    });

    it('should handle rules engine failures gracefully', async () => {
      mockRulesEngine.validateArtifact.mockRejectedValue(new Error('Rules engine timeout'));
      mockRulesEngine.validateContent.mockRejectedValue(new Error('Content validation failed'));

      const result = await qualityEngine.performQualityAssessment(
        mockDeliverable,
        ['coding-standards'],
        { teamId: 'error-test-team' }
      );

      // Should still complete assessment with fallback mechanisms
      expect(result).toBeDefined();
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.quality_dimensions.length).toBeGreaterThan(0);
    });

    it('should handle malformed file content', async () => {
      const malformedContent = '\x00\x01\x02invalid binary content\xFF\xFE';
      
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(malformedContent)
        }
      });

      mockRulesEngine.validateArtifact.mockRejectedValue(new Error('Cannot parse content'));

      const result = await qualityEngine.performQualityAssessment(mockDeliverable);

      expect(result).toBeDefined();
      expect(result.overall_score).toBeLessThan(50); // Should be low due to content issues
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete assessment within reasonable time', async () => {
      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 80,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 100
      });

      const startTime = Date.now();
      
      const result = await qualityEngine.performQualityAssessment(
        mockDeliverable,
        ['coding-standards', 'security-standards'],
        { teamId: 'performance-test-team' }
      );

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle large files efficiently', async () => {
      const largeContent = 'x'.repeat(100000); // 100KB content
      
      s3Mock.on(require('@aws-sdk/client-s3').GetObjectCommand).resolves({
        Body: {
          transformToString: jest.fn().mockResolvedValue(largeContent)
        }
      });

      mockRulesEngine.validateArtifact.mockResolvedValue({
        overall_score: 75,
        max_score: 100,
        passed: true,
        results: [],
        execution_time_ms: 500
      });

      const largeDeliverable: DeliverableRecord = {
        ...mockDeliverable,
        file_size: 100 * 1024 // 100KB
      };

      const result = await qualityEngine.performQualityAssessment(largeDeliverable);

      expect(result).toBeDefined();
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
    });
  });
});