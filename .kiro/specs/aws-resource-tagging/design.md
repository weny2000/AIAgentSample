# Design Document: AWS Resource Tagging

## Overview

This design document outlines the implementation strategy for adding comprehensive, standardized tags to all AWS resources in the AI Agent System infrastructure. The solution will leverage AWS CDK's tagging capabilities to apply consistent tags across all resources, enable cost allocation tracking, support compliance requirements, and facilitate automated resource lifecycle management.

The implementation will be non-invasive, utilizing CDK's built-in tagging mechanisms and aspect-based tagging patterns to ensure all resources receive appropriate tags without requiring extensive code changes to existing constructs.

## Architecture

### High-Level Design

The tagging implementation follows a layered approach:

1. **Centralized Tag Configuration**: A single source of truth for tag definitions, validation rules, and environment-specific values
2. **Tag Application Layer**: CDK Aspects and Tags API to apply tags consistently across all resources
3. **Resource-Specific Tagging**: Custom tagging logic for different resource types based on their characteristics
4. **Validation Layer**: Pre-deployment validation to ensure all resources have required tags
5. **Documentation Layer**: Auto-generated documentation of applied tags for governance

### Design Principles

- **Consistency**: All resources follow the same tagging schema
- **Automation**: Tags are applied automatically during deployment
- **Flexibility**: Support for environment-specific and resource-specific tag values
- **Validation**: Enforce required tags before deployment
- **Maintainability**: Centralized configuration for easy updates
- **Cost Tracking**: Enable detailed cost allocation by component, team, and environment

## Components and Interfaces

### 1. Tag Configuration Module

**File**: `infrastructure/src/config/tag-config.ts`

This module defines the centralized tag configuration including:

```typescript
interface TagConfig {
  mandatory: MandatoryTags;
  optional: OptionalTags;
  resourceSpecific: ResourceSpecificTags;
  environmentSpecific: EnvironmentSpecificTags;
}

interface MandatoryTags {
  Project: string;
  Stage: string;
  ManagedBy: string;
  Component: string;
  Owner: string;
  CostCenter: string;
  Environment: string;
  CreatedDate: string;
  CreatedBy: string;
}

interface OptionalTags {
  DataClassification?: 'Public' | 'Internal' | 'Confidential' | 'Restricted';
  BackupPolicy?: 'Daily' | 'Weekly' | 'Monthly' | 'None';
  ComplianceScope?: string; // e.g., "HIPAA,SOC2,GDPR"
  AutoShutdown?: 'true' | 'false';
  MaintenanceWindow?: string; // e.g., "Sunday-02:00-04:00"
  LastModifiedDate?: string;
}

interface ResourceSpecificTags {
  lambda: LambdaTags;
  dynamodb: DynamoDBTags;
  s3: S3Tags;
  rds: RDSTags;
  vpc: VPCTags;
  apiGateway: ApiGatewayTags;
  stepFunctions: StepFunctionsTags;
  cloudwatch: CloudWatchTags;
  kms: KMSTags;
  cognito: CognitoTags;
}
```

**Responsibilities**:
- Define all tag schemas and valid values
- Provide environment-specific tag values
- Export tag configuration for use by other modules
- Validate tag key/value constraints (length, characters)

### 2. Tag Manager

**File**: `infrastructure/src/utils/tag-manager.ts`

The Tag Manager provides utility functions for applying tags:

```typescript
class TagManager {
  constructor(private config: TagConfig, private stage: string) {}
  
  // Get mandatory tags for any resource
  getMandatoryTags(): Record<string, string>;
  
  // Get environment-specific tags
  getEnvironmentTags(): Record<string, string>;
  
  // Get resource-specific tags
  getResourceTags(resourceType: string, resourceName: string): Record<string, string>;
  
  // Merge all applicable tags for a resource
  getTagsForResource(resourceType: string, resourceName: string, customTags?: Record<string, string>): Record<string, string>;
  
  // Validate tags meet requirements
  validateTags(tags: Record<string, string>): ValidationResult;
  
  // Apply tags to a CDK construct
  applyTags(construct: Construct, tags: Record<string, string>): void;
}
```

**Responsibilities**:
- Provide centralized tag retrieval logic
- Merge mandatory, environment-specific, and resource-specific tags
- Validate tag compliance
- Apply tags to CDK constructs

### 3. Tagging Aspect

**File**: `infrastructure/src/aspects/tagging-aspect.ts`

A CDK Aspect that automatically applies tags to all resources:

```typescript
class TaggingAspect implements IAspect {
  constructor(private tagManager: TagManager) {}
  
  visit(node: IConstruct): void {
    // Identify resource type
    const resourceType = this.getResourceType(node);
    
    // Get appropriate tags
    const tags = this.tagManager.getTagsForResource(
      resourceType,
      node.node.id
    );
    
    // Apply tags
    this.tagManager.applyTags(node, tags);
  }
  
  private getResourceType(node: IConstruct): string {
    // Logic to determine resource type from CDK construct
  }
}
```

**Responsibilities**:
- Traverse CDK construct tree
- Identify resource types
- Apply appropriate tags to each resource
- Handle special cases for resources that don't support standard tagging

### 4. Resource Type Mappers

**File**: `infrastructure/src/utils/resource-type-mapper.ts`

Maps CDK constructs to resource types and determines appropriate tags:

```typescript
class ResourceTypeMapper {
  // Map CDK construct to resource type
  getResourceType(construct: IConstruct): ResourceType;
  
  // Get component name for resource
  getComponentName(resourceType: ResourceType, constructId: string): string;
  
  // Get purpose/function for resource
  getResourcePurpose(resourceType: ResourceType, constructId: string): string;
  
  // Determine if resource stores data
  isDataStorageResource(resourceType: ResourceType): boolean;
  
  // Determine if resource is production-critical
  isProductionCritical(resourceType: ResourceType): boolean;
}
```

**Responsibilities**:
- Identify resource types from CDK constructs
- Determine appropriate component classifications
- Identify data storage resources requiring DataClassification tags
- Support resource-specific tagging logic

### 5. Tag Validator

**File**: `infrastructure/src/utils/tag-validator.ts`

Validates tags before deployment:

```typescript
class TagValidator {
  // Validate all resources have required tags
  validateStack(stack: Stack): ValidationResult;
  
  // Validate individual resource tags
  validateResourceTags(resourceType: string, tags: Record<string, string>): ValidationResult;
  
  // Check tag key/value constraints
  validateTagFormat(key: string, value: string): boolean;
  
  // Ensure data storage resources have DataClassification
  validateDataClassification(resourceType: string, tags: Record<string, string>): boolean;
  
  // Generate validation report
  generateValidationReport(results: ValidationResult[]): string;
}
```

**Responsibilities**:
- Pre-deployment validation of tags
- Enforce mandatory tag requirements
- Validate tag format and constraints
- Generate validation reports for audit

### 6. Tag Documentation Generator

**File**: `infrastructure/src/utils/tag-documentation-generator.ts`

Generates documentation of applied tags:

```typescript
class TagDocumentationGenerator {
  // Generate markdown documentation of all tags
  generateTagDocumentation(stack: Stack): string;
  
  // List all tag keys used
  listTagKeys(): string[];
  
  // Generate cost allocation tag list
  generateCostAllocationTagList(): string[];
  
  // Generate compliance tag report
  generateComplianceReport(): string;
}
```

**Responsibilities**:
- Auto-generate tag documentation
- List tags for cost allocation activation
- Support compliance reporting
- Maintain tag governance documentation

## Data Models

### Tag Configuration Schema

```typescript
// Environment-specific configuration
interface EnvironmentConfig {
  dev: {
    Stage: 'dev';
    Environment: 'Development';
    CostCenter: 'Development';
    AutoShutdown: 'true';
    ComplianceScope: 'None';
  };
  staging: {
    Stage: 'staging';
    Environment: 'Staging';
    CostCenter: 'QA';
    AutoShutdown: 'false';
    ComplianceScope: 'SOC2';
  };
  production: {
    Stage: 'production';
    Environment: 'Production';
    CostCenter: 'Production';
    AutoShutdown: 'false';
    ComplianceScope: 'HIPAA,SOC2,GDPR';
  };
}

// Resource type to component mapping
interface ComponentMapping {
  'AWS::Lambda::Function': 'Compute-Lambda';
  'AWS::DynamoDB::Table': 'Database-DynamoDB';
  'AWS::S3::Bucket': 'Storage-S3';
  'AWS::RDS::DBInstance': 'Database-RDS';
  'AWS::EC2::VPC': 'Network-VPC';
  'AWS::ApiGateway::RestApi': 'API-Gateway';
  'AWS::StepFunctions::StateMachine': 'Orchestration-StepFunctions';
  'AWS::Logs::LogGroup': 'Monitoring-CloudWatch';
  'AWS::KMS::Key': 'Security-KMS';
  'AWS::Cognito::UserPool': 'Security-Cognito';
  // ... additional mappings
}

// Resource-specific tag templates
interface ResourceTagTemplates {
  lambda: {
    Component: 'Compute-Lambda';
    FunctionPurpose: string; // Derived from function name
    Runtime: string; // From Lambda runtime property
  };
  dynamodb: {
    Component: 'Database-DynamoDB';
    TablePurpose: string; // Derived from table name
    DataClassification: 'Internal' | 'Confidential';
  };
  s3: {
    Component: 'Storage-S3';
    BucketPurpose: string; // Derived from bucket name
    DataClassification: 'Internal' | 'Confidential' | 'Restricted';
    BackupPolicy: 'Daily' | 'Weekly' | 'Monthly';
  };
  // ... additional resource types
}
```

### Validation Result Model

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  resourcesValidated: number;
  resourcesWithIssues: number;
}

interface ValidationError {
  resourceId: string;
  resourceType: string;
  errorType: 'MISSING_MANDATORY_TAG' | 'INVALID_TAG_FORMAT' | 'MISSING_DATA_CLASSIFICATION';
  message: string;
  tagKey?: string;
}

interface ValidationWarning {
  resourceId: string;
  resourceType: string;
  warningType: 'MISSING_OPTIONAL_TAG' | 'UNUSUAL_TAG_VALUE';
  message: string;
  tagKey?: string;
}
```

## Implementation Details

### Stack-Level Tag Application

In `ai-agent-stack.ts`, apply base tags to the entire stack:

```typescript
export class AiAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AiAgentStackProps) {
    super(scope, id, props);
    
    // Initialize tag manager
    const tagManager = new TagManager(tagConfig, props.stage);
    
    // Apply mandatory tags at stack level
    const stackTags = tagManager.getMandatoryTags();
    Object.entries(stackTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
    
    // Apply tagging aspect for resource-specific tags
    cdk.Aspects.of(this).add(new TaggingAspect(tagManager));
    
    // ... rest of stack construction
  }
}
```

### Construct-Level Tag Application

In individual constructs (e.g., `dynamodb-tables.ts`), apply resource-specific tags:

```typescript
export class DynamoDBTables extends Construct {
  constructor(scope: Construct, id: string, props: DynamoDBTablesProps) {
    super(scope, id);
    
    const tagManager = new TagManager(tagConfig, props.stage);
    
    // Create table
    this.teamRosterTable = new dynamodb.Table(this, 'TeamRosterTable', {
      // ... table configuration
    });
    
    // Apply resource-specific tags
    const tableTags = tagManager.getResourceTags('dynamodb', 'TeamRosterTable');
    tagManager.applyTags(this.teamRosterTable, {
      ...tableTags,
      TablePurpose: 'TeamManagement',
      DataClassification: 'Internal',
    });
  }
}
```

### Tag Propagation Strategy

1. **Stack-level tags**: Applied to all resources via `cdk.Tags.of(stack).add()`
2. **Construct-level tags**: Applied to specific constructs via `cdk.Tags.of(construct).add()`
3. **Resource-level tags**: Applied directly to L1/L2 constructs via `tags` property
4. **Aspect-based tags**: Applied via CDK Aspects for cross-cutting concerns

Tag precedence (highest to lowest):
1. Resource-level explicit tags
2. Construct-level tags
3. Aspect-applied tags
4. Stack-level tags

### Special Cases

#### CloudWatch Log Groups

CloudWatch Log Groups created automatically by Lambda functions need special handling:

```typescript
// In lambda-functions.ts
const logGroup = new logs.LogGroup(this, 'FunctionLogGroup', {
  logGroupName: `/aws/lambda/${functionName}`,
  // ... configuration
});

// Apply tags explicitly
tagManager.applyTags(logGroup, {
  Component: 'Monitoring-CloudWatch',
  MonitoringType: 'Logs',
  AssociatedResource: functionName,
});
```

#### VPC Subnets and Network Resources

VPC subnets inherit tags from VPC but need additional NetworkTier tags:

```typescript
// Apply tags to VPC
tagManager.applyTags(vpc, {
  Component: 'Network-VPC',
});

// Tag subnets with network tier
vpc.privateSubnets.forEach((subnet, index) => {
  cdk.Tags.of(subnet).add('NetworkTier', 'Private');
  cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
});

vpc.publicSubnets.forEach((subnet, index) => {
  cdk.Tags.of(subnet).add('NetworkTier', 'Public');
  cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
});
```

#### S3 Bucket Policies

S3 buckets support tag-based access control:

```typescript
// Add bucket policy for tag-based access
bucket.addToResourcePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  principals: [new iam.ArnPrincipal(roleArn)],
  actions: ['s3:GetObject'],
  resources: [`${bucket.bucketArn}/*`],
  conditions: {
    StringEquals: {
      's3:ExistingObjectTag/DataClassification': 'Internal',
    },
  },
}));
```

## Error Handling

### Validation Errors

Pre-deployment validation catches missing or invalid tags:

```typescript
class TagValidator {
  validateStack(stack: Stack): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Traverse all resources
    stack.node.findAll().forEach(node => {
      const tags = this.getResourceTags(node);
      
      // Check mandatory tags
      MANDATORY_TAGS.forEach(tagKey => {
        if (!tags[tagKey]) {
          errors.push({
            resourceId: node.node.id,
            resourceType: this.getResourceType(node),
            errorType: 'MISSING_MANDATORY_TAG',
            message: `Missing mandatory tag: ${tagKey}`,
            tagKey,
          });
        }
      });
      
      // Check data classification for storage resources
      if (this.isDataStorageResource(node) && !tags['DataClassification']) {
        errors.push({
          resourceId: node.node.id,
          resourceType: this.getResourceType(node),
          errorType: 'MISSING_DATA_CLASSIFICATION',
          message: 'Data storage resource missing DataClassification tag',
          tagKey: 'DataClassification',
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      resourcesValidated: stack.node.findAll().length,
      resourcesWithIssues: errors.length,
    };
  }
}
```

### Deployment Failures

If validation fails, prevent deployment:

```typescript
// In app.ts
const app = new cdk.App();
const stack = new AiAgentStack(app, `AiAgentStack-${stage}`, { stage });

// Validate tags before synthesis
const validator = new TagValidator();
const validationResult = validator.validateStack(stack);

if (!validationResult.valid) {
  console.error('Tag validation failed:');
  validationResult.errors.forEach(error => {
    console.error(`  - ${error.resourceId}: ${error.message}`);
  });
  process.exit(1);
}

app.synth();
```

### Runtime Tag Updates

For resources that support tag updates without replacement:

```typescript
// Lambda function to update tags on existing resources
export async function updateResourceTags(
  resourceArn: string,
  tags: Record<string, string>
): Promise<void> {
  const resourceType = getResourceTypeFromArn(resourceArn);
  
  try {
    switch (resourceType) {
      case 'lambda':
        await lambda.tagResource({ Resource: resourceArn, Tags: tags });
        break;
      case 's3':
        await s3.putBucketTagging({ Bucket: getBucketName(resourceArn), Tagging: { TagSet: toTagSet(tags) } });
        break;
      // ... other resource types
    }
  } catch (error) {
    console.error(`Failed to update tags for ${resourceArn}:`, error);
    throw error;
  }
}
```

## Testing Strategy

### Unit Tests

Test tag configuration and utility functions:

```typescript
describe('TagManager', () => {
  it('should return mandatory tags', () => {
    const tagManager = new TagManager(tagConfig, 'dev');
    const tags = tagManager.getMandatoryTags();
    
    expect(tags).toHaveProperty('Project', 'AiAgentSystem');
    expect(tags).toHaveProperty('Stage', 'dev');
    expect(tags).toHaveProperty('ManagedBy', 'CDK');
  });
  
  it('should merge environment-specific tags', () => {
    const tagManager = new TagManager(tagConfig, 'production');
    const tags = tagManager.getEnvironmentTags();
    
    expect(tags).toHaveProperty('Environment', 'Production');
    expect(tags).toHaveProperty('AutoShutdown', 'false');
  });
  
  it('should apply resource-specific tags', () => {
    const tagManager = new TagManager(tagConfig, 'dev');
    const tags = tagManager.getResourceTags('lambda', 'ArtifactCheckHandler');
    
    expect(tags).toHaveProperty('Component', 'Compute-Lambda');
    expect(tags).toHaveProperty('FunctionPurpose');
  });
});
```

### Integration Tests

Test tag application in CDK synthesis:

```typescript
describe('AiAgentStack Tagging', () => {
  it('should apply tags to all resources', () => {
    const app = new cdk.App();
    const stack = new AiAgentStack(app, 'TestStack', { stage: 'test' });
    const template = Template.fromStack(stack);
    
    // Verify Lambda functions have required tags
    template.hasResourceProperties('AWS::Lambda::Function', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'AiAgentSystem' },
        { Key: 'Component', Value: 'Compute-Lambda' },
      ]),
    });
    
    // Verify DynamoDB tables have required tags
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'AiAgentSystem' },
        { Key: 'Component', Value: 'Database-DynamoDB' },
        { Key: 'DataClassification', Value: Match.anyValue() },
      ]),
    });
  });
});
```

### Validation Tests

Test tag validation logic:

```typescript
describe('TagValidator', () => {
  it('should detect missing mandatory tags', () => {
    const validator = new TagValidator();
    const result = validator.validateResourceTags('lambda', {
      Project: 'AiAgentSystem',
      // Missing other mandatory tags
    });
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(6); // 6 missing mandatory tags
  });
  
  it('should require DataClassification for storage resources', () => {
    const validator = new TagValidator();
    const result = validator.validateResourceTags('s3', {
      Project: 'AiAgentSystem',
      Stage: 'dev',
      // ... other mandatory tags but missing DataClassification
    });
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'MISSING_DATA_CLASSIFICATION',
      })
    );
  });
});
```

### End-to-End Tests

Deploy stack and verify tags in AWS:

```typescript
describe('Tag Deployment E2E', () => {
  it('should deploy stack with all tags', async () => {
    // Deploy stack
    await deployStack('test');
    
    // Verify Lambda function tags
    const lambda = new AWS.Lambda();
    const functions = await lambda.listFunctions().promise();
    
    for (const func of functions.Functions) {
      const tags = await lambda.listTags({ Resource: func.FunctionArn }).promise();
      
      expect(tags.Tags).toHaveProperty('Project', 'AiAgentSystem');
      expect(tags.Tags).toHaveProperty('Component', 'Compute-Lambda');
      expect(tags.Tags).toHaveProperty('Stage');
    }
    
    // Verify S3 bucket tags
    const s3 = new AWS.S3();
    const buckets = await s3.listBuckets().promise();
    
    for (const bucket of buckets.Buckets) {
      const tagging = await s3.getBucketTagging({ Bucket: bucket.Name }).promise();
      const tags = Object.fromEntries(tagging.TagSet.map(t => [t.Key, t.Value]));
      
      expect(tags).toHaveProperty('Project', 'AiAgentSystem');
      expect(tags).toHaveProperty('Component', 'Storage-S3');
      expect(tags).toHaveProperty('DataClassification');
    }
  });
});
```

## Cost Allocation and Reporting

### Cost Allocation Tag Activation

After deployment, activate cost allocation tags in AWS:

```typescript
// Generate list of tags to activate
const costAllocationTags = [
  'Project',
  'Stage',
  'Environment',
  'Component',
  'Owner',
  'CostCenter',
];

// Output instructions for activation
console.log('Activate the following cost allocation tags in AWS Billing Console:');
costAllocationTags.forEach(tag => console.log(`  - ${tag}`));
```

### Cost Tracking Queries

Example AWS Cost Explorer queries using tags:

```typescript
// Cost by Component
{
  "TimePeriod": { "Start": "2025-01-01", "End": "2025-01-31" },
  "Granularity": "DAILY",
  "Metrics": ["UnblendedCost"],
  "GroupBy": [
    { "Type": "TAG", "Key": "Component" }
  ]
}

// Cost by Environment
{
  "TimePeriod": { "Start": "2025-01-01", "End": "2025-01-31" },
  "Granularity": "MONTHLY",
  "Metrics": ["UnblendedCost"],
  "GroupBy": [
    { "Type": "TAG", "Key": "Stage" }
  ]
}

// Cost by Owner/Team
{
  "TimePeriod": { "Start": "2025-01-01", "End": "2025-01-31" },
  "Granularity": "MONTHLY",
  "Metrics": ["UnblendedCost"],
  "GroupBy": [
    { "Type": "TAG", "Key": "Owner" }
  ]
}
```

## Documentation and Governance

### Auto-Generated Documentation

The Tag Documentation Generator creates:

1. **Tag Reference Guide** (`docs/TAG_REFERENCE.md`):
   - List of all tag keys and their purposes
   - Valid values for each tag
   - Examples of tag application

2. **Resource Tagging Report** (`docs/RESOURCE_TAGGING_REPORT.md`):
   - List of all resources and their tags
   - Tag coverage statistics
   - Missing or incomplete tags

3. **Cost Allocation Guide** (`docs/COST_ALLOCATION_GUIDE.md`):
   - Instructions for activating cost allocation tags
   - Example cost queries
   - Cost optimization recommendations

4. **Compliance Tagging Report** (`docs/COMPLIANCE_TAGGING_REPORT.md`):
   - Resources by compliance scope
   - Data classification summary
   - Audit trail of tag changes

### Governance Policy

Create a tagging governance policy document:

```markdown
# AWS Resource Tagging Policy

## Mandatory Tags

All AWS resources MUST have the following tags:
- Project: "AiAgentSystem"
- Stage: Environment stage (dev/staging/production)
- ManagedBy: "CDK"
- Component: Resource component classification
- Owner: Team or individual responsible
- CostCenter: Cost allocation identifier
- Environment: Deployment environment type
- CreatedDate: ISO 8601 timestamp
- CreatedBy: Deployment mechanism

## Data Storage Resources

Resources that store data MUST have:
- DataClassification: Public/Internal/Confidential/Restricted

## Production Resources

Production resources MUST have:
- ComplianceScope: Applicable compliance frameworks
- BackupPolicy: Backup retention policy

## Tag Maintenance

- Tags are applied automatically during deployment
- Manual tag changes are discouraged
- Tag updates should be made in infrastructure code
- Tag validation runs before every deployment
```

## Migration Strategy

For existing resources without proper tags:

1. **Audit Phase**: Run tag validator against existing stacks
2. **Planning Phase**: Generate migration plan with required tag updates
3. **Implementation Phase**: Deploy updated stack with new tags
4. **Verification Phase**: Verify all resources have required tags
5. **Documentation Phase**: Update documentation with new tagging standards

### Migration Script

```typescript
// Script to add tags to existing resources
async function migrateResourceTags(stackName: string, stage: string) {
  const tagManager = new TagManager(tagConfig, stage);
  
  // Get all resources in stack
  const resources = await getStackResources(stackName);
  
  for (const resource of resources) {
    const resourceType = resource.ResourceType;
    const resourceId = resource.PhysicalResourceId;
    
    // Get required tags
    const tags = tagManager.getTagsForResource(resourceType, resourceId);
    
    // Apply tags
    await updateResourceTags(resourceId, tags);
    
    console.log(`Updated tags for ${resourceId}`);
  }
}
```

## Performance Considerations

- Tag application during CDK synthesis has minimal performance impact
- Tag validation adds ~2-5 seconds to deployment time
- No runtime performance impact on AWS resources
- Cost allocation tag activation may take 24 hours to reflect in billing

## Security Considerations

- Tags may be visible to users with read access to resources
- Avoid including sensitive information in tag values
- Use DataClassification tag to indicate sensitivity level
- Restrict tag modification permissions via IAM policies
- Audit tag changes through CloudTrail

## Maintenance and Updates

- Review and update tag schema quarterly
- Add new resource types as infrastructure evolves
- Update documentation when tags change
- Monitor tag compliance through automated validation
- Adjust cost allocation tags based on reporting needs
