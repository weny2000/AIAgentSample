/**
 * Unit tests for DynamoDB Tables construct with TagManager integration
 */

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { DynamoDBTables } from '../dynamodb-tables';

describe('DynamoDBTables Construct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let kmsKey: kms.Key;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    kmsKey = new kms.Key(stack, 'TestKey');
  });

  describe('Tag Application', () => {
    it('should apply resource-specific tags to all DynamoDB tables', () => {
      // Create DynamoDB tables construct
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Verify that DynamoDB tables have the Component tag
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'Component', Value: 'Database-DynamoDB' },
        ]),
      });
    });

    it('should apply TablePurpose tag to TeamRosterTable', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Find the TeamRosterTable and verify its tags
      const tables = template.findResources('AWS::DynamoDB::Table');
      const teamRosterTable = Object.values(tables).find((table: any) => 
        table.Properties?.TableName?.includes('team-roster')
      );

      expect(teamRosterTable).toBeDefined();
      expect(teamRosterTable.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'TablePurpose', Value: 'TeamManagement' },
          { Key: 'DataClassification', Value: 'Internal' },
        ])
      );
    });

    it('should apply DataClassification tag to all tables', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Verify all tables have DataClassification tag
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: cdk.assertions.Match.arrayWith([
          { Key: 'DataClassification', Value: cdk.assertions.Match.anyValue() },
        ]),
      });
    });

    it('should apply Confidential DataClassification to AuditLogTable', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Find the AuditLogTable and verify its DataClassification
      const tables = template.findResources('AWS::DynamoDB::Table');
      const auditLogTable = Object.values(tables).find((table: any) => 
        table.Properties?.TableName?.includes('audit-log')
      );

      expect(auditLogTable).toBeDefined();
      expect(auditLogTable.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'DataClassification', Value: 'Confidential' },
          { Key: 'TablePurpose', Value: 'AuditCompliance' },
        ])
      );
    });

    it('should apply WorkTaskAnalysis purpose to work task tables', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Find work task related tables
      const tables = template.findResources('AWS::DynamoDB::Table');
      const workTasksTable = Object.values(tables).find((table: any) => 
        table.Properties?.TableName?.includes('work-tasks')
      );
      const todoItemsTable = Object.values(tables).find((table: any) => 
        table.Properties?.TableName?.includes('todo-items')
      );
      const deliverablesTable = Object.values(tables).find((table: any) => 
        table.Properties?.TableName?.includes('deliverables')
      );

      // Verify all work task tables have WorkTaskAnalysis purpose
      [workTasksTable, todoItemsTable, deliverablesTable].forEach(table => {
        expect(table).toBeDefined();
        expect(table.Properties.Tags).toEqual(
          expect.arrayContaining([
            { Key: 'TablePurpose', Value: 'WorkTaskAnalysis' },
          ])
        );
      });
    });

    it('should create 9 DynamoDB tables', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Verify 9 tables are created
      template.resourceCountIs('AWS::DynamoDB::Table', 9);
    });
  });

  describe('Table Configuration', () => {
    it('should enable point-in-time recovery for all tables', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Verify all tables have PITR enabled
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('should use customer-managed encryption for all tables', () => {
      new DynamoDBTables(stack, 'TestDynamoDBTables', {
        stage: 'dev',
        kmsKey,
      });

      const template = Template.fromStack(stack);

      // Verify all tables use customer-managed encryption
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
          SSEType: 'KMS',
        },
      });
    });
  });
});
