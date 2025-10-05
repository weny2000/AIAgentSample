// Mock all AWS SDK and service dependencies before importing
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('../../../../services/quality-assessment-engine');

import { handler, QualityCheckInput } from '../quality-check-workflow-handler';

describe('Quality Check Workflow Handler', () => {
  const mockDeliverable = {
    deliverable_id: 'del-123',
    todo_id: 'todo-123',
    file_name: 'test.ts',
    file_type: 'code',
    file_size: 1024,
    s3_key: 'deliverables/test.ts',
    submitted_by: 'user-123',
    submitted_at: new Date().toISOString()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('check_format step', () => {
    it('should check format quality successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'check_format'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.dimension).toBe('format');
    });
  });

  describe('check_completeness step', () => {
    it('should check completeness quality successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'check_completeness'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.dimension).toBe('completeness');
    });
  });

  describe('check_accuracy step', () => {
    it('should check accuracy quality successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'check_accuracy'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.dimension).toBe('accuracy');
    });
  });

  describe('check_clarity step', () => {
    it('should check clarity quality successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'check_clarity'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.dimension).toBe('clarity');
    });
  });

  describe('check_consistency step', () => {
    it('should check consistency quality successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'check_consistency'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.dimension).toBe('consistency');
    });
  });

  describe('aggregate_quality step', () => {
    it('should aggregate quality results successfully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'aggregate_quality',
        context: {
          formatResult: { dimension: 'format', score: 85, weight: 0.2, details: 'Good format' },
          completenessResult: { dimension: 'completeness', score: 90, weight: 0.25, details: 'Complete' },
          accuracyResult: { dimension: 'accuracy', score: 80, weight: 0.25, details: 'Accurate' },
          clarityResult: { dimension: 'clarity', score: 75, weight: 0.15, details: 'Clear' },
          consistencyResult: { dimension: 'consistency', score: 85, weight: 0.15, details: 'Consistent' }
        }
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.overall_score).toBeGreaterThan(0);
      expect(result.result.quality_dimensions).toHaveLength(5);
      expect(result.result.assessed_at).toBeDefined();
    });

    it('should generate improvement suggestions for low scores', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'aggregate_quality',
        context: {
          formatResult: { dimension: 'format', score: 60, weight: 0.2, details: 'Format issues' },
          completenessResult: { dimension: 'completeness', score: 50, weight: 0.25, details: 'Incomplete' },
          accuracyResult: { dimension: 'accuracy', score: 65, weight: 0.25, details: 'Some inaccuracies' },
          clarityResult: { dimension: 'clarity', score: 55, weight: 0.15, details: 'Unclear' },
          consistencyResult: { dimension: 'consistency', score: 70, weight: 0.15, details: 'Mostly consistent' }
        }
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.result.improvement_suggestions).toBeDefined();
      expect(result.result.improvement_suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle unknown step gracefully', async () => {
      const input: any = {
        checkId: 'check-123',
        deliverable: mockDeliverable,
        step: 'unknown_step'
      };

      const result = await handler(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unknown workflow step');
    });

    it('should handle processing errors gracefully', async () => {
      const input: QualityCheckInput = {
        checkId: 'check-123',
        deliverable: { ...mockDeliverable, file_type: '' }, // Invalid file type
        step: 'check_format'
      };

      const result = await handler(input);

      // Should still return a result, possibly with lower score
      expect(result).toBeDefined();
      expect(result.checkId).toBe('check-123');
    });
  });
});
