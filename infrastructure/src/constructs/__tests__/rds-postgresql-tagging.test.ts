/**
 * Unit tests for RDS PostgreSQL construct with TagManager integration
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { RdsPostgreSql } from '../rds-postgresql';

describe('RdsPostgreSql Construct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.Vpc;
  let kmsKey: kms.Key;
  let lambdaSecurityGroup: ec2.SecurityGroup;
  let ecsSecurityGroup: ec2.SecurityGroup;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    
    // Create VPC
    vpc = new ec2.Vpc(stack, 'TestVpc', {
      maxAzs: 2,
    });
    
    // Create KMS key
    kmsKey = new kms.Key(stack, 'TestKey');
    
    // Create security groups
    lambdaSecurityGroup = new ec2.SecurityGroup(stack, 'LambdaSG', {
      vpc,
      description: 'Test Lambda security group',
    });
    
    ecsSecurityGroup = new ec2.SecurityGroup(stack, 'EcsSG', {
      vpc,
      description: 'Test ECS security group',
    });
  });

  describe('Tag Application', () => {
    it('should apply resource-specific tags to RDS instance', () => {
      // Create RDS construct
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify that RDS instance has the Component tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'Component', Value: 'Database-RDS' },
        ]),
      });
    });

    it('should apply Engine tag with PostgreSQL value', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify Engine tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'Engine', Value: 'PostgreSQL' },
        ]),
      });
    });

    it('should apply DataClassification tag with Confidential value', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify DataClassification tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'DataClassification', Value: 'Confidential' },
        ]),
      });
    });

    it('should apply BackupPolicy tag based on backup configuration for dev', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify BackupPolicy tag for dev (7 days = Weekly)
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'BackupPolicy', Value: 'Weekly' },
        ]),
      });
    });

    it('should apply BackupPolicy tag based on backup configuration for prod', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'prod',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify BackupPolicy tag for prod (30 days = Daily)
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'BackupPolicy', Value: 'Daily' },
        ]),
      });
    });

    it('should apply all required tags to RDS instance', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'staging',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify Component tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'Component', Value: 'Database-RDS' },
        ]),
      });

      // Verify Engine tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'Engine', Value: 'PostgreSQL' },
        ]),
      });

      // Verify DataClassification tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'DataClassification', Value: 'Confidential' },
        ]),
      });

      // Verify BackupPolicy tag
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'BackupPolicy', Value: 'Weekly' },
        ]),
      });
    });

    it('should apply tags to read replica in production', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'prod',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify read replica exists in production
      template.resourceCountIs('AWS::RDS::DBInstance', 2);

      // Verify read replica has tags
      const instances = template.findResources('AWS::RDS::DBInstance');
      const readReplica = Object.values(instances).find((instance: any) => 
        instance.Properties?.SourceDBInstanceIdentifier !== undefined
      );

      expect(readReplica).toBeDefined();
      expect(readReplica.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'Component', Value: 'Database-RDS' },
          { Key: 'Engine', Value: 'PostgreSQL' },
          { Key: 'DataClassification', Value: 'Confidential' },
          { Key: 'BackupPolicy', Value: 'Daily' },
          { Key: 'ReplicaType', Value: 'ReadReplica' },
        ])
      );
    });

    it('should not create read replica in non-production environments', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify only one RDS instance exists (no read replica)
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });
  });

  describe('Database Configuration', () => {
    it('should enable encryption at rest', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify encryption is enabled
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
      });
    });

    it('should configure backup retention based on stage', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'prod',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify backup retention for production
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 30,
      });
    });

    it('should enable performance insights', () => {
      new RdsPostgreSql(stack, 'TestRds', {
        vpc,
        kmsKey,
        stage: 'dev',
        lambdaSecurityGroup,
        ecsSecurityGroup,
      });

      const template = Template.fromStack(stack);

      // Verify performance insights is enabled
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        EnablePerformanceInsights: true,
      });
    });
  });
});
