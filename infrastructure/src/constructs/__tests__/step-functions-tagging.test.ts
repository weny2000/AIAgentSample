/**
 * Tests for Step Functions Tagging
 * 
 * Verifies that Step Functions state machines and their CloudWatch log groups
 * have the correct resource-specific tags applied.
 */

import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('StepFunctions Tagging', () => {
  let stack: cdk.Stack;
  let tagManager: TagManager;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Initialize TagManager
    tagManager = new TagManager(getTagConfig('dev'), 'dev');
  });

  describe('State Machine Tags', () => {
    it('should create state machine with proper tags', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'TestStateMachine', {
        stateMachineName: 'test-workflow-dev',
        definition,
      });

      // Apply tags using TagManager
      tagManager.applyTags(stateMachine, {
        ...tagManager.getResourceTags('stepfunctions', 'TestStateMachine'),
        WorkflowPurpose: 'TestWorkflow',
      });

      const template = Template.fromStack(stack);

      // Verify state machine has the expected tags
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineName: 'test-workflow-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Orchestration-StepFunctions' },
          { Key: 'WorkflowPurpose', Value: 'TestWorkflow' },
        ]),
      });
    });

    it('should apply mandatory tags to state machine', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState2', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'TestStateMachine2', {
        stateMachineName: 'test-workflow-2-dev',
        definition,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('stepfunctions', 'TestStateMachine2', {
        WorkflowPurpose: 'ArtifactCompliance',
      });
      tagManager.applyTags(stateMachine, allTags);

      const template = Template.fromStack(stack);
      const stateMachines = template.findResources('AWS::StepFunctions::StateMachine');
      const stateMachineKeys = Object.keys(stateMachines);

      // Check state machine has mandatory tags
      stateMachineKeys.forEach((key) => {
        const sm = stateMachines[key];
        const tags = sm.Properties.Tags || [];
        const tagKeys = tags.map((t: any) => t.Key);

        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
        expect(tagKeys).toContain('Owner');
        expect(tagKeys).toContain('CostCenter');
        expect(tagKeys).toContain('Environment');
      });
    });

    it('should include WorkflowPurpose tag for artifact check workflow', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState3', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'ArtifactCheckWorkflow', {
        stateMachineName: 'artifact-check-dev',
        definition,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('stepfunctions', 'ArtifactCheckWorkflow', {
        WorkflowPurpose: 'ArtifactCompliance',
      });
      tagManager.applyTags(stateMachine, allTags);

      const template = Template.fromStack(stack);

      // Verify WorkflowPurpose tag is present
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        Tags: Match.arrayWith([
          { Key: 'WorkflowPurpose', Value: 'ArtifactCompliance' },
        ]),
      });
    });

    it('should include WorkflowPurpose tag for work task analysis workflow', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState4', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'TaskAnalysisWorkflow', {
        stateMachineName: 'task-analysis-dev',
        definition,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('stepfunctions', 'TaskAnalysisWorkflow', {
        WorkflowPurpose: 'WorkTaskAnalysis',
      });
      tagManager.applyTags(stateMachine, allTags);

      const template = Template.fromStack(stack);

      // Verify WorkflowPurpose tag is present
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        Tags: Match.arrayWith([
          { Key: 'WorkflowPurpose', Value: 'WorkTaskAnalysis' },
        ]),
      });
    });

    it('should include WorkflowPurpose tag for deliverable verification workflow', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState5', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'DeliverableVerificationWorkflow', {
        stateMachineName: 'deliverable-verification-dev',
        definition,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('stepfunctions', 'DeliverableVerificationWorkflow', {
        WorkflowPurpose: 'DeliverableVerification',
      });
      tagManager.applyTags(stateMachine, allTags);

      const template = Template.fromStack(stack);

      // Verify WorkflowPurpose tag is present
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        Tags: Match.arrayWith([
          { Key: 'WorkflowPurpose', Value: 'DeliverableVerification' },
        ]),
      });
    });

    it('should include WorkflowPurpose tag for quality check workflow', () => {
      const definition = new stepfunctions.Pass(stack, 'PassState6', {
        result: stepfunctions.Result.fromObject({ status: 'success' }),
      });

      const stateMachine = new stepfunctions.StateMachine(stack, 'QualityCheckWorkflow', {
        stateMachineName: 'quality-check-dev',
        definition,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('stepfunctions', 'QualityCheckWorkflow', {
        WorkflowPurpose: 'QualityCheck',
      });
      tagManager.applyTags(stateMachine, allTags);

      const template = Template.fromStack(stack);

      // Verify WorkflowPurpose tag is present
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        Tags: Match.arrayWith([
          { Key: 'WorkflowPurpose', Value: 'QualityCheck' },
        ]),
      });
    });
  });

  describe('CloudWatch Log Group Tags', () => {
    it('should create CloudWatch log group with proper tags', () => {
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/stepfunctions/test-workflow-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      tagManager.applyTags(logGroup, {
        ...tagManager.getResourceTags('cloudwatch', 'StepFunctionsLogGroup'),
        MonitoringType: 'Logs',
        AssociatedResource: 'StepFunctions-ArtifactCheck',
      });

      const template = Template.fromStack(stack);

      // Verify log group has the expected tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/stepfunctions/test-workflow-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });

    it('should apply mandatory tags to CloudWatch log groups', () => {
      const logGroup = new logs.LogGroup(stack, 'TestLogGroup2', {
        logGroupName: '/aws/stepfunctions/test-workflow-2-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      const allTags = tagManager.getTagsForResource('cloudwatch', 'StepFunctionsLogGroup', {
        MonitoringType: 'Logs',
        AssociatedResource: 'StepFunctions-WorkTask',
      });
      tagManager.applyTags(logGroup, allTags);

      const template = Template.fromStack(stack);
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      const logGroupKeys = Object.keys(logGroups);

      // Check log group has mandatory tags
      logGroupKeys.forEach((key) => {
        const lg = logGroups[key];
        const tags = lg.Properties.Tags || [];
        const tagKeys = tags.map((t: any) => t.Key);

        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
        expect(tagKeys).toContain('Owner');
        expect(tagKeys).toContain('CostCenter');
        expect(tagKeys).toContain('Environment');
      });
    });

    it('should tag ECS log groups for static checks', () => {
      const logGroup = new logs.LogGroup(stack, 'StaticChecksLogGroup', {
        logGroupName: '/aws/ecs/ai-agent-static-checks-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      tagManager.applyTags(logGroup, {
        ...tagManager.getResourceTags('cloudwatch', 'StaticChecksLogGroup'),
        MonitoringType: 'Logs',
        AssociatedResource: 'ECS-StaticChecks',
      });

      const template = Template.fromStack(stack);

      // Verify log group has the expected tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/ecs/ai-agent-static-checks-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });

    it('should tag ECS log groups for semantic checks', () => {
      const logGroup = new logs.LogGroup(stack, 'SemanticChecksLogGroup', {
        logGroupName: '/aws/ecs/ai-agent-semantic-checks-dev',
        retention: logs.RetentionDays.ONE_MONTH,
      });

      // Apply tags using TagManager
      tagManager.applyTags(logGroup, {
        ...tagManager.getResourceTags('cloudwatch', 'SemanticChecksLogGroup'),
        MonitoringType: 'Logs',
        AssociatedResource: 'ECS-SemanticChecks',
      });

      const template = Template.fromStack(stack);

      // Verify log group has the expected tags
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/ecs/ai-agent-semantic-checks-dev',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring-CloudWatch' },
          { Key: 'MonitoringType', Value: 'Logs' },
        ]),
      });
    });
  });

  describe('Tag Validation', () => {
    it('should validate Step Functions tags', () => {
      const tags = tagManager.getTagsForResource('stepfunctions', 'TestWorkflow', {
        WorkflowPurpose: 'TestWorkflow',
      });

      const validationResult = tagManager.validateTags(tags, 'stepfunctions');

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should detect missing mandatory tags', () => {
      const incompleteTags = {
        Component: 'Orchestration-StepFunctions',
        WorkflowPurpose: 'TestWorkflow',
      };

      const validationResult = tagManager.validateTags(incompleteTags, 'stepfunctions');

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Type Mapping', () => {
    it('should map Step Functions to correct component', () => {
      const tags = tagManager.getResourceTags('stepfunctions', 'TestWorkflow');

      expect(tags.Component).toBe('Orchestration-StepFunctions');
      expect(tags.WorkflowPurpose).toBeDefined();
    });

    it('should derive workflow purpose from name', () => {
      const tags1 = tagManager.getResourceTags('stepfunctions', 'IngestionWorkflow');
      expect(tags1.WorkflowPurpose).toContain('Ingestion');

      const tags2 = tagManager.getResourceTags('stepfunctions', 'ProcessingWorkflow');
      expect(tags2.WorkflowPurpose).toBeDefined();

      const tags3 = tagManager.getResourceTags('stepfunctions', 'AgentWorkflow');
      expect(tags3.WorkflowPurpose).toContain('Agent');
    });
  });
});
