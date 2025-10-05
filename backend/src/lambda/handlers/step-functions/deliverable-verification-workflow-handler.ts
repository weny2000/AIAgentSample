/**
 * Lambda handler for batch deliverable verification workflow
 * Handles batch processing of deliverable validations
 */

import { Handler } from 'aws-lambda';
import { ArtifactValidationService } from '../../../services/artifact-validation-service';
import { QualityAssessmentEngine } from '../../../services/quality-assessment-engine';
import { Logger } from '../../utils/logger';
import { DeliverableRecord } from '../../../models/work-task-models';

const logger = new Logger({ correlationId: 'deliverable-verification-workflow', operation: 'DeliverableVerificationWorkflow' });

export interface DeliverableVerificationInput {
  batchId: string;
  deliverables: Array<{
    deliverable_id: string;
    todo_id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    s3_key: string;
    submitted_by: string;
    submitted_at: string;
  }>;
  step: 'validate_batch' | 'process_single' | 'aggregate_results';
  deliverableIndex?: number;
  context?: any;
}

export interface DeliverableVerificationOutput {
  batchId: string;
  step: string;
  status: 'success' | 'failed' | 'partial';
  results?: any;
  error?: string;
  executionTime: number;
  processedCount?: number;
  failedCount?: number;
}

/**
 * Main handler for deliverable verification workflow
 */
export const handler: Handler<DeliverableVerificationInput, DeliverableVerificationOutput> = async (event) => {
  const startTime = Date.now();
  
  logger.info('Deliverable verification workflow step started', {
    batchId: event.batchId,
    step: event.step,
    deliverableCount: event.deliverables?.length
  });

  try {
    const validationService = new ArtifactValidationService();
    const qualityEngine = new QualityAssessmentEngine();

    let results: any;
    let processedCount = 0;
    let failedCount = 0;

    switch (event.step) {
      case 'validate_batch':
        ({ results, processedCount, failedCount } = await validateBatch(validationService, qualityEngine, event));
        break;
      
      case 'process_single':
        results = await processSingleDeliverable(validationService, qualityEngine, event);
        processedCount = 1;
        failedCount = results.validation_result?.is_valid === false ? 1 : 0;
        break;
      
      case 'aggregate_results':
        results = await aggregateResults(event);
        processedCount = event.context?.processedCount || 0;
        failedCount = event.context?.failedCount || 0;
        break;
      
      default:
        throw new Error(`Unknown workflow step: ${event.step}`);
    }

    const executionTime = Date.now() - startTime;
    const status = failedCount === 0 ? 'success' : (processedCount > failedCount ? 'partial' : 'failed');

    logger.info('Deliverable verification workflow step completed', {
      batchId: event.batchId,
      step: event.step,
      status,
      processedCount,
      failedCount,
      executionTime
    });

    return {
      batchId: event.batchId,
      step: event.step,
      status,
      results,
      processedCount,
      failedCount,
      executionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error('Deliverable verification workflow step failed', error as Error, {
      batchId: event.batchId,
      step: event.step
    });

    return {
      batchId: event.batchId,
      step: event.step,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime
    };
  }
};

async function validateBatch(
  validationService: ArtifactValidationService,
  qualityEngine: QualityAssessmentEngine,
  event: DeliverableVerificationInput
) {
  const results = [];
  let processedCount = 0;
  let failedCount = 0;

  // Process deliverables in parallel with concurrency limit
  const CONCURRENCY_LIMIT = 5;
  const chunks = chunkArray(event.deliverables, CONCURRENCY_LIMIT);

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(async (deliverable) => {
        try {
          const deliverableRecord: DeliverableRecord = {
            ...deliverable,
            status: 'submitted'
          };

          // Validate deliverable
          const validationResult = await validationService.validateDeliverable(
            deliverable.todo_id,
            deliverableRecord
          );

          // Perform quality assessment
          const qualityResult = await qualityEngine.performQualityAssessment(
            deliverableRecord,
            [],
            { validationResult }
          );

          processedCount++;

          if (!validationResult.is_valid || qualityResult.overall_score < 50) {
            failedCount++;
          }

          return {
            deliverable_id: deliverable.deliverable_id,
            todo_id: deliverable.todo_id,
            validation_result: validationResult,
            quality_assessment: qualityResult,
            status: validationResult.is_valid && qualityResult.overall_score >= 50 ? 'approved' : 'rejected'
          };
        } catch (error) {
          failedCount++;
          processedCount++;
          
          return {
            deliverable_id: deliverable.deliverable_id,
            todo_id: deliverable.todo_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'error'
          };
        }
      })
    );

    results.push(...chunkResults.map(r => r.status === 'fulfilled' ? r.value : { error: 'Promise rejected' }));
  }

  return { results, processedCount, failedCount };
}

async function processSingleDeliverable(
  validationService: ArtifactValidationService,
  qualityEngine: QualityAssessmentEngine,
  event: DeliverableVerificationInput
) {
  const index = event.deliverableIndex || 0;
  const deliverable = event.deliverables[index];

  if (!deliverable) {
    throw new Error(`Deliverable at index ${index} not found`);
  }

  const deliverableRecord: DeliverableRecord = {
    ...deliverable,
    status: 'submitted'
  };

  // Validate deliverable
  const validation_result = await validationService.validateDeliverable(
    deliverable.todo_id,
    deliverableRecord
  );

  // Perform quality assessment
  const quality_assessment = await qualityEngine.performQualityAssessment(
    deliverableRecord,
    [],
    { validationResult: validation_result }
  );

  return {
    deliverable_id: deliverable.deliverable_id,
    todo_id: deliverable.todo_id,
    validation_result,
    quality_assessment,
    status: validation_result.is_valid && quality_assessment.overall_score >= 50 ? 'approved' : 'rejected'
  };
}

async function aggregateResults(event: DeliverableVerificationInput) {
  const context = event.context || {};
  const results = context.results || [];

  const summary = {
    batchId: event.batchId,
    totalDeliverables: event.deliverables.length,
    processedCount: context.processedCount || 0,
    failedCount: context.failedCount || 0,
    approvedCount: results.filter((r: any) => r.status === 'approved').length,
    rejectedCount: results.filter((r: any) => r.status === 'rejected').length,
    errorCount: results.filter((r: any) => r.status === 'error').length,
    results,
    aggregatedAt: new Date().toISOString()
  };

  return summary;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
