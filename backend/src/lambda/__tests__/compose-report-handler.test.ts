import { handler } from '../handlers/compose-report-handler';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the AWS clients
const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

describe('compose-report-handler', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    
    // Set environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.JOB_STATUS_TABLE = 'test-job-status-table';
    process.env.ARTIFACTS_BUCKET_NAME = 'test-artifacts-bucket';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockEvent = {
    jobId: 'test-job-123',
    artifactCheckRequest: {
      artifactType: 'code',
      userId: 'user-123',
      teamId: 'team-456',
    },
    userContext: {
      userId: 'user-123',
      teamId: 'team-456',
      role: 'developer',
      department: 'engineering',
      clearance: 'standard',
      permissions: ['read', 'write'],
    },
    kendraResults: {
      Payload: {
        results: [
          {
            id: 'doc-1',
            sourceType: 'confluence',
            confidence: 0.85,
            excerpt: 'Code review guidelines...',
            uri: 'https://confluence.example.com/doc-1',
          },
          {
            id: 'doc-2',
            sourceType: 'policy',
            confidence: 0.92,
            excerpt: 'Security requirements...',
          },
        ],
      },
    },
    staticCheckResults: {
      taskResult: {
        issues: [
          {
            severity: 'high',
            description: 'Unused variable detected',
            location: 'file.js:42',
            remediation: 'Remove unused variable',
          },
          {
            severity: 'medium',
            description: 'Missing semicolon',
            location: 'file.js:15',
            remediation: 'Add semicolon',
          },
        ],
      },
    },
    semanticCheckResults: {
      taskResult: {
        issues: [
          {
            severity: 'critical',
            description: 'Hardcoded credentials detected',
            remediation: 'Use environment variables or secrets manager',
          },
        ],
      },
    },
  };

  describe('successful report composition', () => {
    beforeEach(() => {
      s3Mock.on(PutObjectCommand).resolves({});
      dynamoMock.on(UpdateItemCommand).resolves({});
    });

    it('should compose a complete report successfully', async () => {
      const result = await handler(mockEvent);

      expect(result.jobStatus).toBe('completed');
      expect(result.report).toBeDefined();
      expect(result.report.complianceScore).toBe(52); // 100 - 25 (critical) - 15 (high) - 8 (medium)
      expect(result.report.issues).toHaveLength(3);
      expect(result.report.sourceReferences).toHaveLength(2);
      expect(result.reportUrl).toMatch(/^s3:\/\/test-artifacts-bucket\/reports\/test-job-123\/compliance-report\.json$/);
    });

    it('should calculate compliance score correctly', async () => {
      const eventWithNoIssues = {
        ...mockEvent,
        staticCheckResults: { taskResult: { issues: [] } },
        semanticCheckResults: { taskResult: { issues: [] } },
      };

      const result = await handler(eventWithNoIssues);

      expect(result.report.complianceScore).toBe(100);
    });

    it('should handle missing static check results', async () => {
      const eventWithMissingStatic = {
        ...mockEvent,
        staticCheckResults: {},
      };

      const result = await handler(eventWithMissingStatic);

      expect(result.report.issues).toHaveLength(1); // Only semantic issue
      expect(result.report.complianceScore).toBe(75); // 100 - 25 (critical)
    });

    it('should handle missing semantic check results', async () => {
      const eventWithMissingSemantic = {
        ...mockEvent,
        semanticCheckResults: {},
      };

      const result = await handler(eventWithMissingSemantic);

      expect(result.report.issues).toHaveLength(2); // Only static issues
      expect(result.report.complianceScore).toBe(77); // 100 - 15 (high) - 8 (medium)
    });

    it('should generate appropriate recommendations', async () => {
      const result = await handler(mockEvent);

      expect(result.report.recommendations).toContain(
        'Address 1 critical issue(s) before proceeding with deployment'
      );
      expect(result.report.recommendations).toContain(
        'Review and resolve 1 high-severity issue(s) to improve compliance'
      );
      expect(result.report.recommendations).toContain(
        'Run automated linting and formatting tools to address static analysis issues'
      );
      expect(result.report.recommendations).toContain(
        'Review artifact content for alignment with organizational policies and standards'
      );
    });

    it('should generate artifact-specific recommendations', async () => {
      const dockerEvent = {
        ...mockEvent,
        artifactCheckRequest: {
          ...mockEvent.artifactCheckRequest,
          artifactType: 'dockerfile',
        },
      };

      const result = await handler(dockerEvent);

      expect(result.report.recommendations).toContain(
        'Ensure container images follow security hardening guidelines'
      );
    });

    it('should store report in S3 with correct metadata', async () => {
      await handler(mockEvent);

      expect(s3Mock.calls()).toHaveLength(1);
      const s3Call = s3Mock.call(0).args[0];
      
      expect(s3Call.input).toMatchObject({
        Bucket: 'test-artifacts-bucket',
        Key: 'reports/test-job-123/compliance-report.json',
        ContentType: 'application/json',
        Metadata: {
          jobId: 'test-job-123',
          correlationId: 'test-job-123',
          timestamp: expect.any(String),
        },
      });

      const reportBody = JSON.parse(s3Call.input.Body);
      expect(reportBody).toHaveProperty('complianceScore');
      expect(reportBody).toHaveProperty('issues');
      expect(reportBody).toHaveProperty('recommendations');
      expect(reportBody).toHaveProperty('sourceReferences');
      expect(reportBody).toHaveProperty('summary');
    });

    it('should update job status in DynamoDB', async () => {
      await handler(mockEvent);

      expect(dynamoMock.calls()).toHaveLength(1);
      const dynamoCall = dynamoMock.call(0).args[0];
      
      expect(dynamoCall.input).toMatchObject({
        TableName: 'test-job-status-table',
        Key: {
          jobId: { S: 'test-job-123' },
        },
        UpdateExpression: expect.stringContaining('SET #status = :status'),
        ExpressionAttributeNames: expect.objectContaining({
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          '#progress': 'progress',
          '#result': 'result',
        }),
        ExpressionAttributeValues: expect.objectContaining({
          ':status': { S: 'completed' },
          ':progress': { N: '100' },
        }),
      });
    });
  });

  describe('severity mapping', () => {
    it('should map severity levels correctly', async () => {
      const eventWithVariousSeverities = {
        ...mockEvent,
        staticCheckResults: {
          taskResult: {
            issues: [
              { severity: 'error', description: 'Error issue' },
              { severity: 'warning', description: 'Warning issue' },
              { severity: 'info', description: 'Info issue' },
              { severity: 'minor', description: 'Minor issue' },
            ],
          },
        },
        semanticCheckResults: { taskResult: { issues: [] } },
      };

      const result = await handler(eventWithVariousSeverities);

      const severities = result.report.issues.map(issue => issue.severity);
      expect(severities).toContain('critical'); // error -> critical
      expect(severities).toContain('high');     // warning -> high
      expect(severities).toContain('medium');   // info -> medium
      expect(severities).toContain('low');      // minor -> low
    });
  });

  describe('summary generation', () => {
    it('should generate summary for perfect compliance', async () => {
      const perfectEvent = {
        ...mockEvent,
        staticCheckResults: { taskResult: { issues: [] } },
        semanticCheckResults: { taskResult: { issues: [] } },
      };

      const result = await handler(perfectEvent);

      expect(result.report.summary).toContain('Overall compliance score: 100/100');
      expect(result.report.summary).toContain('No issues detected');
      expect(result.report.summary).toContain('Artifact meets all compliance requirements');
    });

    it('should generate summary for low compliance', async () => {
      const lowComplianceEvent = {
        ...mockEvent,
        staticCheckResults: {
          taskResult: {
            issues: Array(10).fill({
              severity: 'high',
              description: 'High severity issue',
            }),
          },
        },
      };

      const result = await handler(lowComplianceEvent);

      expect(result.report.complianceScore).toBeLessThan(70);
      expect(result.report.summary).toContain('Significant improvements needed');
    });

    it('should generate summary for good compliance with minor issues', async () => {
      const goodComplianceEvent = {
        ...mockEvent,
        staticCheckResults: {
          taskResult: {
            issues: [
              { severity: 'low', description: 'Minor issue 1' },
              { severity: 'low', description: 'Minor issue 2' },
            ],
          },
        },
        semanticCheckResults: { taskResult: { issues: [] } },
      };

      const result = await handler(goodComplianceEvent);

      expect(result.report.complianceScore).toBeGreaterThanOrEqual(80);
      expect(result.report.summary).toContain('generally compliant with minor issues');
    });
  });

  describe('error handling', () => {
    it('should handle S3 storage errors', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('S3 access denied'));
      dynamoMock.on(UpdateItemCommand).resolves({});

      await expect(handler(mockEvent)).rejects.toThrow('S3 access denied');
    });

    it('should handle DynamoDB update errors', async () => {
      s3Mock.on(PutObjectCommand).resolves({});
      dynamoMock.on(UpdateItemCommand).rejects(new Error('DynamoDB error'));

      await expect(handler(mockEvent)).rejects.toThrow('DynamoDB error');
    });

    it('should update job status to failed on error', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('Storage error'));
      dynamoMock.on(UpdateItemCommand).resolves({});

      try {
        await handler(mockEvent);
      } catch (error) {
        // Expected to throw
      }

      // Should have attempted to update status to failed
      expect(dynamoMock.calls()).toHaveLength(1);
      const failedUpdateCall = dynamoMock.call(0).args[0];
      expect(failedUpdateCall.input.ExpressionAttributeValues[':status']).toEqual({ S: 'failed' });
    });

    it('should handle missing environment variables', async () => {
      delete process.env.ARTIFACTS_BUCKET_NAME;

      await expect(handler(mockEvent)).rejects.toThrow(
        'ARTIFACTS_BUCKET_NAME environment variable not set'
      );
    });
  });
});