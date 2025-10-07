/**
 * Unit tests for tag configuration module
 */

import {
  validateTagKey,
  validateTagValue,
  TAG_CONSTRAINTS,
  getBaseMandatoryTags,
  getTagConfig,
  ENVIRONMENT_CONFIGS,
  RESOURCE_TYPE_TO_COMPONENT,
  DATA_STORAGE_RESOURCE_TYPES,
  PRODUCTION_CRITICAL_RESOURCE_TYPES,
  MANDATORY_TAG_KEYS,
  COST_ALLOCATION_TAG_KEYS,
} from '../tag-config';

describe('Tag Validation', () => {
  describe('validateTagKey', () => {
    it('should accept valid tag keys', () => {
      const validKeys = [
        'Project',
        'Component',
        'Cost-Center',
        'Data_Classification',
        'Environment:Type',
        'Team/Owner',
        'Version+1',
        'Key=Value',
        'Path.To.Resource',
        'Email@Domain',
        'Key With Spaces',
      ];

      validKeys.forEach(key => {
        const result = validateTagKey(key);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject empty tag keys', () => {
      const result = validateTagKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject tag keys exceeding maximum length', () => {
      const longKey = 'a'.repeat(TAG_CONSTRAINTS.MAX_KEY_LENGTH + 1);
      const result = validateTagKey(longKey);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject tag keys with invalid characters', () => {
      const invalidKeys = ['Key!', 'Key#', 'Key$', 'Key%', 'Key*', 'Key()', 'Key[]'];

      invalidKeys.forEach(key => {
        const result = validateTagKey(key);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('invalid characters');
      });
    });

    it('should accept tag keys at maximum length', () => {
      const maxLengthKey = 'a'.repeat(TAG_CONSTRAINTS.MAX_KEY_LENGTH);
      const result = validateTagKey(maxLengthKey);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTagValue', () => {
    it('should accept valid tag values', () => {
      const validValues = [
        'AiAgentSystem',
        'production',
        'Compute-Lambda',
        'value-with-dashes',
        'value_with_underscores',
        'value:with:colons',
        'value/with/slashes',
        'value+plus',
        'value=equals',
        'value.with.dots',
        'value@at',
        'Value With Spaces',
        '',
      ];

      validValues.forEach(value => {
        const result = validateTagValue(value);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject tag values exceeding maximum length', () => {
      const longValue = 'a'.repeat(TAG_CONSTRAINTS.MAX_VALUE_LENGTH + 1);
      const result = validateTagValue(longValue);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject tag values with invalid characters', () => {
      const invalidValues = ['value!', 'value#', 'value$', 'value%', 'value*'];

      invalidValues.forEach(value => {
        const result = validateTagValue(value);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('invalid characters');
      });
    });

    it('should accept tag values at maximum length', () => {
      const maxLengthValue = 'a'.repeat(TAG_CONSTRAINTS.MAX_VALUE_LENGTH);
      const result = validateTagValue(maxLengthValue);
      expect(result.valid).toBe(true);
    });

    it('should accept empty tag values', () => {
      const result = validateTagValue('');
      expect(result.valid).toBe(true);
    });
  });
});

describe('Base Mandatory Tags', () => {
  it('should return base mandatory tags', () => {
    const tags = getBaseMandatoryTags();

    expect(tags.Project).toBe('AiAgentSystem');
    expect(tags.ManagedBy).toBe('CDK');
    expect(tags.CreatedBy).toBe('CDK-Deployment');
    expect(tags.CreatedDate).toBeDefined();
    expect(tags.CreatedDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should generate ISO 8601 timestamp for CreatedDate', () => {
    const tags = getBaseMandatoryTags();
    const date = new Date(tags.CreatedDate!);
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).not.toBeNaN();
  });
});

describe('Environment-Specific Configuration', () => {
  describe('Development Environment', () => {
    it('should have correct dev environment configuration', () => {
      const config = ENVIRONMENT_CONFIGS.dev;

      expect(config.Stage).toBe('dev');
      expect(config.Environment).toBe('Development');
      expect(config.CostCenter).toBe('Development');
      expect(config.AutoShutdown).toBe('true');
      expect(config.ComplianceScope).toBe('None');
    });
  });

  describe('Staging Environment', () => {
    it('should have correct staging environment configuration', () => {
      const config = ENVIRONMENT_CONFIGS.staging;

      expect(config.Stage).toBe('staging');
      expect(config.Environment).toBe('Staging');
      expect(config.CostCenter).toBe('QA');
      expect(config.AutoShutdown).toBe('false');
      expect(config.ComplianceScope).toBe('SOC2');
    });
  });

  describe('Production Environment', () => {
    it('should have correct production environment configuration', () => {
      const config = ENVIRONMENT_CONFIGS.production;

      expect(config.Stage).toBe('production');
      expect(config.Environment).toBe('Production');
      expect(config.CostCenter).toBe('Production');
      expect(config.AutoShutdown).toBe('false');
      expect(config.ComplianceScope).toBe('HIPAA,SOC2,GDPR');
    });
  });
});

describe('Tag Configuration', () => {
  it('should return complete tag configuration for dev environment', () => {
    const config = getTagConfig('dev');

    expect(config.mandatory.Project).toBe('AiAgentSystem');
    expect(config.mandatory.Stage).toBe('dev');
    expect(config.mandatory.Environment).toBe('Development');
    expect(config.mandatory.CostCenter).toBe('Development');
    expect(config.mandatory.ManagedBy).toBe('CDK');
    expect(config.mandatory.Owner).toBe('Platform');
    expect(config.optional.AutoShutdown).toBe('true');
    expect(config.optional.ComplianceScope).toBe('None');
  });

  it('should return complete tag configuration for staging environment', () => {
    const config = getTagConfig('staging');

    expect(config.mandatory.Stage).toBe('staging');
    expect(config.mandatory.Environment).toBe('Staging');
    expect(config.mandatory.CostCenter).toBe('QA');
    expect(config.optional.AutoShutdown).toBe('false');
    expect(config.optional.ComplianceScope).toBe('SOC2');
  });

  it('should return complete tag configuration for production environment', () => {
    const config = getTagConfig('production');

    expect(config.mandatory.Stage).toBe('production');
    expect(config.mandatory.Environment).toBe('Production');
    expect(config.mandatory.CostCenter).toBe('Production');
    expect(config.optional.AutoShutdown).toBe('false');
    expect(config.optional.ComplianceScope).toBe('HIPAA,SOC2,GDPR');
  });

  it('should default to dev environment for unknown stages', () => {
    const config = getTagConfig('unknown');

    expect(config.mandatory.Stage).toBe('dev');
    expect(config.mandatory.Environment).toBe('Development');
  });

  it('should include environment-specific configurations', () => {
    const config = getTagConfig('production');

    expect(config.environmentSpecific).toBeDefined();
    expect(config.environmentSpecific.dev).toBeDefined();
    expect(config.environmentSpecific.staging).toBeDefined();
    expect(config.environmentSpecific.production).toBeDefined();
  });
});

describe('Resource Type Mapping', () => {
  it('should map Lambda functions to Compute-Lambda component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::Lambda::Function']).toBe('Compute-Lambda');
  });

  it('should map DynamoDB tables to Database-DynamoDB component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::DynamoDB::Table']).toBe('Database-DynamoDB');
  });

  it('should map S3 buckets to Storage-S3 component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::S3::Bucket']).toBe('Storage-S3');
  });

  it('should map RDS instances to Database-RDS component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::RDS::DBInstance']).toBe('Database-RDS');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::RDS::DBCluster']).toBe('Database-RDS');
  });

  it('should map VPC resources to Network-VPC component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::EC2::VPC']).toBe('Network-VPC');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::EC2::Subnet']).toBe('Network-VPC');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::EC2::RouteTable']).toBe('Network-VPC');
  });

  it('should map API Gateway to API-Gateway component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::ApiGateway::RestApi']).toBe('API-Gateway');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::ApiGatewayV2::Api']).toBe('API-Gateway');
  });

  it('should map Step Functions to Orchestration-StepFunctions component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::StepFunctions::StateMachine']).toBe('Orchestration-StepFunctions');
  });

  it('should map CloudWatch resources to Monitoring-CloudWatch component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::Logs::LogGroup']).toBe('Monitoring-CloudWatch');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::CloudWatch::Alarm']).toBe('Monitoring-CloudWatch');
  });

  it('should map KMS resources to Security-KMS component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::KMS::Key']).toBe('Security-KMS');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::KMS::Alias']).toBe('Security-KMS');
  });

  it('should map Cognito resources to Security-Cognito component', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::Cognito::UserPool']).toBe('Security-Cognito');
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::Cognito::IdentityPool']).toBe('Security-Cognito');
  });

  it('should include security group mapping', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::EC2::SecurityGroup']).toBe('Network-SecurityGroup');
  });

  it('should include Kendra search mapping', () => {
    expect(RESOURCE_TYPE_TO_COMPONENT['AWS::Kendra::Index']).toBe('Search-Kendra');
  });
});

describe('Data Storage Resource Types', () => {
  it('should identify S3 buckets as data storage resources', () => {
    expect(DATA_STORAGE_RESOURCE_TYPES).toContain('AWS::S3::Bucket');
  });

  it('should identify DynamoDB tables as data storage resources', () => {
    expect(DATA_STORAGE_RESOURCE_TYPES).toContain('AWS::DynamoDB::Table');
  });

  it('should identify RDS instances as data storage resources', () => {
    expect(DATA_STORAGE_RESOURCE_TYPES).toContain('AWS::RDS::DBInstance');
    expect(DATA_STORAGE_RESOURCE_TYPES).toContain('AWS::RDS::DBCluster');
  });

  it('should identify Kendra index as data storage resource', () => {
    expect(DATA_STORAGE_RESOURCE_TYPES).toContain('AWS::Kendra::Index');
  });

  it('should have exactly 5 data storage resource types', () => {
    expect(DATA_STORAGE_RESOURCE_TYPES).toHaveLength(5);
  });
});

describe('Production Critical Resource Types', () => {
  it('should identify databases as production critical', () => {
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::RDS::DBInstance');
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::RDS::DBCluster');
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::DynamoDB::Table');
  });

  it('should identify compute resources as production critical', () => {
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::Lambda::Function');
  });

  it('should identify API Gateway as production critical', () => {
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::ApiGateway::RestApi');
  });

  it('should identify Step Functions as production critical', () => {
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toContain('AWS::StepFunctions::StateMachine');
  });

  it('should have exactly 6 production critical resource types', () => {
    expect(PRODUCTION_CRITICAL_RESOURCE_TYPES).toHaveLength(6);
  });
});

describe('Tag Key Constants', () => {
  it('should define all mandatory tag keys', () => {
    expect(MANDATORY_TAG_KEYS).toContain('Project');
    expect(MANDATORY_TAG_KEYS).toContain('Stage');
    expect(MANDATORY_TAG_KEYS).toContain('ManagedBy');
    expect(MANDATORY_TAG_KEYS).toContain('Component');
    expect(MANDATORY_TAG_KEYS).toContain('Owner');
    expect(MANDATORY_TAG_KEYS).toContain('CostCenter');
    expect(MANDATORY_TAG_KEYS).toContain('Environment');
    expect(MANDATORY_TAG_KEYS).toContain('CreatedDate');
    expect(MANDATORY_TAG_KEYS).toContain('CreatedBy');
  });

  it('should have exactly 9 mandatory tag keys', () => {
    expect(MANDATORY_TAG_KEYS).toHaveLength(9);
  });

  it('should define cost allocation tag keys', () => {
    expect(COST_ALLOCATION_TAG_KEYS).toContain('Project');
    expect(COST_ALLOCATION_TAG_KEYS).toContain('Stage');
    expect(COST_ALLOCATION_TAG_KEYS).toContain('Environment');
    expect(COST_ALLOCATION_TAG_KEYS).toContain('Component');
    expect(COST_ALLOCATION_TAG_KEYS).toContain('Owner');
    expect(COST_ALLOCATION_TAG_KEYS).toContain('CostCenter');
  });

  it('should have exactly 6 cost allocation tag keys', () => {
    expect(COST_ALLOCATION_TAG_KEYS).toHaveLength(6);
  });
});

describe('Tag Constraints', () => {
  it('should define maximum key length of 128 characters', () => {
    expect(TAG_CONSTRAINTS.MAX_KEY_LENGTH).toBe(128);
  });

  it('should define maximum value length of 256 characters', () => {
    expect(TAG_CONSTRAINTS.MAX_VALUE_LENGTH).toBe(256);
  });

  it('should define allowed key pattern', () => {
    expect(TAG_CONSTRAINTS.ALLOWED_KEY_PATTERN).toBeInstanceOf(RegExp);
  });

  it('should define allowed value pattern', () => {
    expect(TAG_CONSTRAINTS.ALLOWED_VALUE_PATTERN).toBeInstanceOf(RegExp);
  });
});
