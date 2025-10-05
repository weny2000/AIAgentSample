/**
 * Lambda handler for parallel quality checking workflow
 * Handles parallel processing of quality checks across multiple dimensions
 */

import { Handler } from 'aws-lambda';
import { QualityAssessmentEngine } from '../../../services/quality-assessment-engine';
import { Logger } from '../../utils/logger';
import { DeliverableRecord, QualityDimension } from '../../../models/work-task-models';

const logger = new Logger({ correlationId: 'quality-check-workflow', operation: 'QualityCheckWorkflow' });

export interface QualityCheckInput {
  checkId: string;
  deliverable: {
    deliverable_id: string;
    todo_id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    s3_key: string;
    submitted_by: string;
    submitted_at: string;
  };
  step: 'check_format' | 'check_completeness' | 'check_accuracy' | 'check_clarity' | 'check_consistency' | 'aggregate_quality';
  qualityStandards?: string[];
  context?: any;
}

export interface QualityCheckOutput {
  checkId: string;
  step: string;
  status: 'success' | 'failed';
  result?: any;
  error?: string;
  executionTime: number;
}

/**
 * Main handler for quality check workflow steps
 */
export const handler: Handler<QualityCheckInput, QualityCheckOutput> = async (event) => {
  const startTime = Date.now();
  
  logger.info('Quality check workflow step started', {
    checkId: event.checkId,
    step: event.step,
    deliverableId: event.deliverable.deliverable_id
  });

  try {
    const qualityEngine = new QualityAssessmentEngine();
    const deliverableRecord: DeliverableRecord = {
      ...event.deliverable,
      status: 'submitted'
    };

    let result: any;

    switch (event.step) {
      case 'check_format':
        result = await checkFormatQuality(qualityEngine, deliverableRecord);
        break;
      
      case 'check_completeness':
        result = await checkCompletenessQuality(qualityEngine, deliverableRecord);
        break;
      
      case 'check_accuracy':
        result = await checkAccuracyQuality(qualityEngine, deliverableRecord);
        break;
      
      case 'check_clarity':
        result = await checkClarityQuality(qualityEngine, deliverableRecord);
        break;
      
      case 'check_consistency':
        result = await checkConsistencyQuality(qualityEngine, deliverableRecord);
        break;
      
      case 'aggregate_quality':
        result = await aggregateQualityResults(event);
        break;
      
      default:
        throw new Error(`Unknown workflow step: ${event.step}`);
    }

    const executionTime = Date.now() - startTime;

    logger.info('Quality check workflow step completed', {
      checkId: event.checkId,
      step: event.step,
      executionTime
    });

    return {
      checkId: event.checkId,
      step: event.step,
      status: 'success',
      result,
      executionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error('Quality check workflow step failed', error as Error, {
      checkId: event.checkId,
      step: event.step
    });

    return {
      checkId: event.checkId,
      step: event.step,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime
    };
  }
};

async function checkFormatQuality(
  engine: QualityAssessmentEngine,
  deliverable: DeliverableRecord
): Promise<QualityDimension> {
  // Get dimension configuration for format
  const dimensionConfigs = engine.getQualityDimensionConfig(deliverable.file_type);
  const formatConfig = dimensionConfigs.find(d => d.dimension === 'format');

  if (!formatConfig) {
    return {
      dimension: 'format',
      score: 50,
      weight: 0.2,
      details: 'No format configuration found for file type'
    };
  }

  // Perform full assessment and extract format dimension
  const assessment = await engine.performQualityAssessment(deliverable, []);
  const formatDimension = assessment.quality_dimensions.find(d => d.dimension === 'format');

  return formatDimension || {
    dimension: 'format',
    score: 0,
    weight: formatConfig.weight,
    details: 'Format check failed'
  };
}

async function checkCompletenessQuality(
  engine: QualityAssessmentEngine,
  deliverable: DeliverableRecord
): Promise<QualityDimension> {
  const dimensionConfigs = engine.getQualityDimensionConfig(deliverable.file_type);
  const completenessConfig = dimensionConfigs.find(d => d.dimension === 'completeness');

  if (!completenessConfig) {
    return {
      dimension: 'completeness',
      score: 50,
      weight: 0.2,
      details: 'No completeness configuration found for file type'
    };
  }

  const assessment = await engine.performQualityAssessment(deliverable, []);
  const completenessDimension = assessment.quality_dimensions.find(d => d.dimension === 'completeness');

  return completenessDimension || {
    dimension: 'completeness',
    score: 0,
    weight: completenessConfig.weight,
    details: 'Completeness check failed'
  };
}

async function checkAccuracyQuality(
  engine: QualityAssessmentEngine,
  deliverable: DeliverableRecord
): Promise<QualityDimension> {
  const dimensionConfigs = engine.getQualityDimensionConfig(deliverable.file_type);
  const accuracyConfig = dimensionConfigs.find(d => d.dimension === 'accuracy');

  if (!accuracyConfig) {
    return {
      dimension: 'accuracy',
      score: 50,
      weight: 0.2,
      details: 'No accuracy configuration found for file type'
    };
  }

  const assessment = await engine.performQualityAssessment(deliverable, []);
  const accuracyDimension = assessment.quality_dimensions.find(d => d.dimension === 'accuracy');

  return accuracyDimension || {
    dimension: 'accuracy',
    score: 0,
    weight: accuracyConfig.weight,
    details: 'Accuracy check failed'
  };
}

async function checkClarityQuality(
  engine: QualityAssessmentEngine,
  deliverable: DeliverableRecord
): Promise<QualityDimension> {
  const dimensionConfigs = engine.getQualityDimensionConfig(deliverable.file_type);
  const clarityConfig = dimensionConfigs.find(d => d.dimension === 'clarity');

  if (!clarityConfig) {
    return {
      dimension: 'clarity',
      score: 50,
      weight: 0.2,
      details: 'No clarity configuration found for file type'
    };
  }

  const assessment = await engine.performQualityAssessment(deliverable, []);
  const clarityDimension = assessment.quality_dimensions.find(d => d.dimension === 'clarity');

  return clarityDimension || {
    dimension: 'clarity',
    score: 0,
    weight: clarityConfig.weight,
    details: 'Clarity check failed'
  };
}

async function checkConsistencyQuality(
  engine: QualityAssessmentEngine,
  deliverable: DeliverableRecord
): Promise<QualityDimension> {
  const dimensionConfigs = engine.getQualityDimensionConfig(deliverable.file_type);
  const consistencyConfig = dimensionConfigs.find(d => d.dimension === 'consistency');

  if (!consistencyConfig) {
    return {
      dimension: 'consistency',
      score: 50,
      weight: 0.2,
      details: 'No consistency configuration found for file type'
    };
  }

  const assessment = await engine.performQualityAssessment(deliverable, []);
  const consistencyDimension = assessment.quality_dimensions.find(d => d.dimension === 'consistency');

  return consistencyDimension || {
    dimension: 'consistency',
    score: 0,
    weight: consistencyConfig.weight,
    details: 'Consistency check failed'
  };
}

async function aggregateQualityResults(event: QualityCheckInput) {
  const context = event.context || {};
  
  // Collect all quality dimensions from parallel checks
  const dimensions: QualityDimension[] = [
    context.formatResult,
    context.completenessResult,
    context.accuracyResult,
    context.clarityResult,
    context.consistencyResult
  ].filter(Boolean);

  // Calculate overall score
  const totalWeight = dimensions.reduce((sum, dim) => sum + dim.weight, 0);
  const weightedScore = dimensions.reduce((sum, dim) => sum + (dim.score * dim.weight), 0);
  const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  // Generate improvement suggestions
  const improvementSuggestions: string[] = [];
  dimensions.forEach(dim => {
    if (dim.score < 70) {
      improvementSuggestions.push(`Improve ${dim.dimension}: ${dim.details}`);
    }
  });

  return {
    checkId: event.checkId,
    deliverable_id: event.deliverable.deliverable_id,
    overall_score: overallScore,
    quality_dimensions: dimensions,
    improvement_suggestions: improvementSuggestions,
    assessed_at: new Date().toISOString()
  };
}
