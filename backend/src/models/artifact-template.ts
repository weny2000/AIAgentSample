import { DynamoDBItem, TimestampFields } from './index';

/**
 * Check definition for artifact templates
 */
export interface CheckDefinition {
  id: string;
  type: 'static' | 'semantic' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  rule_config: Record<string, any>;
  enabled?: boolean;
  weight?: number; // For scoring calculation
}

/**
 * Artifact template interface
 */
export interface ArtifactTemplate {
  artifact_type: string;
  required_sections: string[];
  optional_sections: string[];
  checks: CheckDefinition[];
  threshold: number;
  version: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

/**
 * DynamoDB item structure for artifact templates
 */
export interface ArtifactTemplateItem extends ArtifactTemplate, DynamoDBItem {
  pk: string; // artifact_type
  entity_type: 'artifact_template';
}

/**
 * Input for creating artifact template
 */
export interface CreateArtifactTemplateInput {
  artifact_type: string;
  required_sections: string[];
  optional_sections?: string[];
  checks: CheckDefinition[];
  threshold: number;
  version: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

/**
 * Input for updating artifact template
 */
export interface UpdateArtifactTemplateInput {
  artifact_type: string;
  required_sections?: string[];
  optional_sections?: string[];
  checks?: CheckDefinition[];
  threshold?: number;
  version?: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

/**
 * Query parameters for artifact template
 */
export interface QueryArtifactTemplateParams {
  artifact_type: string;
}