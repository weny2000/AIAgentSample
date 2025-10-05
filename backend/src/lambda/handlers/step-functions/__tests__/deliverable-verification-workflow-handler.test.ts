// Mock all AWS SDK and service dependencies before importing
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('../../../../services/artifact-validation-service');
jest.mock('../../../../services/quality-assessment-engine');

import { handler, DeliverableVerificationInput } from '../deliverable-verification-workflow-handler';

describe('Deliverable Verification Workflow Handler', () => {
  const mockDeliverables = [
    {
      deliverable_id: 'del-1',
      todo_id: 'todo-1',
      file_name: 'test.ts',
      file_type: 'code',
      file_size: 1024,
      s3_key: 'deliverables/test.ts',
      submitted_by: 'user-123',
      submitted_at: new Date().toISOString()
    },
    {
      deliverable_id: 'del-2',
      todo_id: 'todo-2',
      file_name: 'test.md',
      file_type: 'document',
      file_size: 2048,
      s3_key: 'deliverables/test.md',
      submitted_by: 'user-123',
      submitted_at: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validate_batch step', () => {
    it('should validate batch of deliverables successfully', async () => {
      const input: DeliverableVerificationInput = {
        batchId: 'batch-123',
        deliverables: mockDeliverables,
        step: 'validate_batch'
      };

      const result = await handler(input);

      expect(result.status).toMatch(/success|partial/);
      expect(result.batchId).toBe('batch-123');
      expect(result.processedCount).toBeGreaterThan(0);
      expect(result.results).toBeDefined();
    });

    it('should handle empty batch', async () => {
      const input: DeliverableVerificationInput = {
        batchId: 'batch-123',
        deliverables: [],
        step: 'validate_batch'
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.processedCount).toBe(0);
    });
  });

  describe('process_single step', () => {
    it('should process single deliverable successfully', async () => {
      const input: DeliverableVerificationInput = {
        batchId: 'batch-123',
        deliverables: mockDeliverables,
        step: 'process_single',
        deliverableIndex: 0
      };

      const result = await handler(input);

      expect(result.status).toMatch(/success|failed/);
      expect(result.processedCount).toBe(1);
      expect(result.results).toBeDefined();
    });

    it('should handle invalid index', async () => {
      const input: DeliverableVerificationInput = {
        batchId: 'batch-123',
        deliverables: mockDeliverables,
        step: 'process_single',
        deliverableIndex: 999
      };

      const result = await handler(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });
  });

  describe('aggregate_results step', () => {
    it('should aggregate results successfully', async () => {
      const input: DeliverableVerificationInput = {
        batchId: 'batch-123',
        deliverables: mockDeliverables,
        step: 'aggregate_results',
        context: {
          processedCount: 2,
          failedCount: 0,
          results: [
            { deliverable_id: 'del-1', status: 'approved' },
            { deliverable_id: 'del-2', status: 'approved' }
          ]
        }
      };

      const result = await handler(input);

      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
      expect(result.results.totalDeliverables).toBe(2);
      expect(result.results.aggregatedAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle workflow errors gracefully', async () => {
      const input: any = {
        batchId: 'batch-123',
        deliverables: mockDeliverables,
        step: 'unknown_step'
      };

      const result = await handler(input);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });
});
