import { BaseRepository, RepositoryConfig } from './base-repository';
import { 
  ArtifactTemplate, 
  ArtifactTemplateItem, 
  CreateArtifactTemplateInput, 
  UpdateArtifactTemplateInput,
  QueryArtifactTemplateParams,
  PaginatedResponse 
} from '../models';

export class ArtifactTemplateRepository extends BaseRepository<ArtifactTemplateItem> {
  constructor(config: RepositoryConfig) {
    super(config);
  }

  /**
   * Create a new artifact template
   */
  async create(input: CreateArtifactTemplateInput): Promise<ArtifactTemplate> {
    this.validateRequiredFields(input, [
      'artifact_type', 
      'required_sections', 
      'checks', 
      'threshold', 
      'version'
    ]);

    const item: ArtifactTemplateItem = {
      pk: input.artifact_type,
      entity_type: 'artifact_template',
      artifact_type: input.artifact_type,
      required_sections: input.required_sections,
      optional_sections: input.optional_sections || [],
      checks: input.checks,
      threshold: input.threshold,
      version: input.version,
    };

    // Ensure artifact template doesn't already exist
    await this.putItem(item, 'attribute_not_exists(pk)');

    // Return the created item without DynamoDB metadata
    const { pk, entity_type, ...artifactTemplate } = item;
    return artifactTemplate as ArtifactTemplate;
  }

  /**
   * Get an artifact template by artifact_type
   */
  async getByArtifactType(params: QueryArtifactTemplateParams): Promise<ArtifactTemplate | null> {
    const item = await this.getItem({ pk: params.artifact_type });
    
    if (!item || item.entity_type !== 'artifact_template') {
      return null;
    }

    // Return without DynamoDB metadata
    const { pk, entity_type, ...artifactTemplate } = item;
    return artifactTemplate as ArtifactTemplate;
  }

  /**
   * Update an artifact template
   */
  async update(input: UpdateArtifactTemplateInput): Promise<ArtifactTemplate | null> {
    this.validateRequiredFields(input, ['artifact_type']);

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Build update expression dynamically
    if (input.required_sections !== undefined) {
      updateExpressions.push('#required_sections = :required_sections');
      expressionAttributeNames['#required_sections'] = 'required_sections';
      expressionAttributeValues[':required_sections'] = input.required_sections;
    }

    if (input.optional_sections !== undefined) {
      updateExpressions.push('#optional_sections = :optional_sections');
      expressionAttributeNames['#optional_sections'] = 'optional_sections';
      expressionAttributeValues[':optional_sections'] = input.optional_sections;
    }

    if (input.checks !== undefined) {
      updateExpressions.push('#checks = :checks');
      expressionAttributeNames['#checks'] = 'checks';
      expressionAttributeValues[':checks'] = input.checks;
    }

    if (input.threshold !== undefined) {
      updateExpressions.push('#threshold = :threshold');
      expressionAttributeNames['#threshold'] = 'threshold';
      expressionAttributeValues[':threshold'] = input.threshold;
    }

    if (input.version !== undefined) {
      updateExpressions.push('#version = :version');
      expressionAttributeNames['#version'] = 'version';
      expressionAttributeValues[':version'] = input.version;
    }

    if (updateExpressions.length === 0) {
      // Nothing to update
      return this.getByArtifactType({ artifact_type: input.artifact_type });
    }

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    const updatedItem = await this.updateItem(
      { pk: input.artifact_type },
      updateExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      'attribute_exists(pk)' // Ensure template exists
    );

    if (!updatedItem) {
      return null;
    }

    // Return without DynamoDB metadata
    const { pk, entity_type, ...artifactTemplate } = updatedItem;
    return artifactTemplate as ArtifactTemplate;
  }

  /**
   * Delete an artifact template
   */
  async delete(artifactType: string): Promise<void> {
    await this.deleteItem(
      { pk: artifactType },
      'attribute_exists(pk)' // Ensure template exists
    );
  }

  /**
   * List all artifact templates
   */
  async listAll(limit?: number, lastEvaluatedKey?: Record<string, any>): Promise<{
    templates: ArtifactTemplate[];
    lastEvaluatedKey?: Record<string, any>;
    count: number;
  }> {
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'artifact_template' },
      undefined,
      limit,
      lastEvaluatedKey
    );

    const templates = result.items.map(item => {
      const { pk, entity_type, ...artifactTemplate } = item;
      return artifactTemplate as ArtifactTemplate;
    });

    return {
      templates,
      lastEvaluatedKey: result.last_evaluated_key,
      count: result.count,
    };
  }

  /**
   * Get templates by version using GSI
   */
  async getByVersion(version: string, limit?: number, lastEvaluatedKey?: Record<string, any>): Promise<{
    templates: ArtifactTemplate[];
    lastEvaluatedKey?: Record<string, any>;
    count: number;
  }> {
    const result = await this.queryItems(
      '#version = :version',
      { '#version': 'version' },
      { ':version': version },
      undefined,
      'version-index',
      limit,
      lastEvaluatedKey
    );

    const templates = result.items.map(item => {
      const { pk, entity_type, ...artifactTemplate } = item;
      return artifactTemplate as ArtifactTemplate;
    });

    return {
      templates,
      lastEvaluatedKey: result.last_evaluated_key,
      count: result.count,
    };
  }

  /**
   * Get templates by check type
   */
  async getByCheckType(checkType: 'static' | 'semantic' | 'security'): Promise<ArtifactTemplate[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'artifact_template' }
    );

    // Filter templates that have checks of the specified type
    return result.items
      .filter(item => item.checks.some(check => check.type === checkType))
      .map(item => {
        const { pk, entity_type, ...artifactTemplate } = item;
        return artifactTemplate as ArtifactTemplate;
      });
  }

  /**
   * Get templates by severity level
   */
  async getBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Promise<ArtifactTemplate[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type',
      { '#entity_type': 'entity_type' },
      { ':entity_type': 'artifact_template' }
    );

    // Filter templates that have checks of the specified severity
    return result.items
      .filter(item => item.checks.some(check => check.severity === severity))
      .map(item => {
        const { pk, entity_type, ...artifactTemplate } = item;
        return artifactTemplate as ArtifactTemplate;
      });
  }

  /**
   * Get templates with threshold above a certain value
   */
  async getByMinThreshold(minThreshold: number): Promise<ArtifactTemplate[]> {
    const result = await this.scanItems(
      '#entity_type = :entity_type AND #threshold >= :min_threshold',
      { 
        '#entity_type': 'entity_type',
        '#threshold': 'threshold'
      },
      { 
        ':entity_type': 'artifact_template',
        ':min_threshold': minThreshold
      }
    );

    return result.items.map(item => {
      const { pk, entity_type, ...artifactTemplate } = item;
      return artifactTemplate as ArtifactTemplate;
    });
  }

  /**
   * Check if an artifact type exists
   */
  async exists(artifactType: string): Promise<boolean> {
    const item = await this.getItem({ pk: artifactType });
    return item !== null && item.entity_type === 'artifact_template';
  }
}