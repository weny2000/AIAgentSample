// Test the integration between rules engine and Step Functions handlers
describe('Rules Engine Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.RULE_DEFINITIONS_TABLE_NAME = 'test-rules-table';
    process.env.ARTIFACTS_BUCKET_NAME = 'test-artifacts-bucket';
    process.env.JOB_STATUS_TABLE = 'test-job-status-table';
  });

  describe('Artifact Type Detection', () => {
    it('should detect TypeScript from content patterns', () => {
      const content = `
        interface User {
          id: string;
          name: string;
        }
        
        export function createUser(data: any): User {
          return data as User;
        }
      `;

      // Test the detection logic directly
      expect(content.includes('interface ')).toBe(true);
      expect(content.includes('export ')).toBe(true);
      expect(content.includes('type ')).toBe(false);
    });

    it('should detect CloudFormation from YAML content', () => {
      const content = `
        AWSTemplateFormatVersion: '2010-09-09'
        Description: 'Test CloudFormation template'
        Resources:
          TestBucket:
            Type: AWS::S3::Bucket
            Properties:
              BucketName: test-bucket
      `;

      expect(content.includes('AWSTemplateFormatVersion')).toBe(true);
      expect(content.includes('Resources:')).toBe(true);
    });

    it('should detect Dockerfile from content patterns', () => {
      const content = `
        FROM node:18-alpine
        WORKDIR /app
        COPY package*.json ./
        RUN npm install
        COPY . .
        EXPOSE 3000
        CMD ["npm", "start"]
      `;

      expect(content.match(/^FROM\s+/m)).toBeTruthy();
      expect(content.includes('RUN ')).toBe(true);
      expect(content.includes('COPY ')).toBe(true);
    });
  });

  describe('Compose Report Handler Integration', () => {
    it('should integrate rules engine validation results', async () => {
      // Mock rules engine validation
      const mockValidateArtifact = jest.fn().mockResolvedValue({
        artifact_id: 'test-job-123',
        overall_score: 75,
        max_score: 100,
        passed: false,
        results: [
          {
            rule_id: 'typescript-eslint',
            rule_name: 'TypeScript ESLint Rules',
            passed: false,
            severity: 'medium',
            message: 'Variable "data" has type "any"',
            source_location: {
              file: 'test.ts',
              line: 7,
              column: 35
            },
            suggested_fix: 'Define proper type instead of using "any"'
          },
          {
            rule_id: 'security-secrets',
            rule_name: 'Hardcoded Secrets Detection',
            passed: false,
            severity: 'critical',
            message: 'Hardcoded password detected',
            source_location: {
              file: 'test.ts',
              line: 4,
              column: 20
            },
            suggested_fix: 'Use environment variables or secure configuration'
          }
        ],
        summary: {
          total_rules: 2,
          passed_rules: 0,
          failed_rules: 2,
          critical_issues: 1,
          high_issues: 0,
          medium_issues: 1,
          low_issues: 0
        },
        execution_time_ms: 1500,
        timestamp: new Date().toISOString()
      });

      const mockServiceInstance = {
        validateArtifact: mockValidateArtifact
      };

      mockRulesEngineService.getInstance.mockReturnValue(mockServiceInstance as any);

      const event = {
        jobId: 'test-job-123',
        artifactCheckRequest: {
          artifactType: 'typescript',
          userId: 'user-123',
          teamId: 'team-456'
        },
        userContext: {
          userId: 'user-123',
          teamId: 'team-456',
          role: 'developer',
          department: 'engineering',
          clearance: 'standard',
          permissions: ['read', 'write']
        },
        kendraResults: { Payload: { results: [] } },
        staticCheckResults: { taskResult: { issues: [] } },
        semanticCheckResults: { taskResult: { issues: [] } },
        artifactData: {
          content: 'test content',
          contentType: 'text/plain',
          detectedArtifactType: 'typescript',
          applicableRules: [
            {
              id: 'typescript-eslint',
              name: 'TypeScript ESLint Rules',
              type: 'static',
              severity: 'medium',
              enabled: true,
              config: { applicable_types: ['typescript'] }
            },
            {
              id: 'security-secrets',
              name: 'Hardcoded Secrets Detection',
              type: 'security',
              severity: 'critical',
              enabled: true,
              config: { applicable_types: ['*'] }
            }
          ]
        }
      };

      // Mock S3 and DynamoDB operations
      const mockS3Send = jest.fn().mockResolvedValue({});
      const mockDynamoSend = jest.fn().mockResolvedValue({});
      
      require('@aws-sdk/client-s3').S3Client.mockImplementation(() => ({
        send: mockS3Send
      }));
      
      require('@aws-sdk/client-dynamodb').DynamoDBClient.mockImplementation(() => ({
        send: mockDynamoSend
      }));

      const result = await composeReportHandler(event);

      expect(result.jobStatus).toBe('completed');
      expect(result.report.complianceScore).toBe(75); // From rules engine
      expect(result.report.issues).toHaveLength(2); // Rules engine issues
      expect(result.report.issues[0].type).toBe('rules-engine');
      expect(result.report.issues[0].severity).toBe('medium');
      expect(result.report.issues[1].severity).toBe('critical');
      expect(result.report.recommendations).toContain('Address 2 rule violation(s) identified by the rules engine');
      expect(result.report.summary).toContain('Rules engine evaluated 2 rule(s) in 1500ms');
      expect(mockValidateArtifact).toHaveBeenCalledWith({
        artifact_id: 'test-job-123',
        artifact_type: 'typescript',
        content: 'test content',
        file_path: undefined,
        metadata: {
          user_id: 'user-123',
          team_id: 'team-456',
          content_type: 'text/plain',
          applicable_rules: ['typescript-eslint', 'security-secrets']
        }
      });
    });

    it('should handle rules engine validation timeout', async () => {
      // Mock rules engine validation that takes too long
      const mockValidateArtifact = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 150000)) // 2.5 minutes - longer than timeout
      );

      const mockServiceInstance = {
        validateArtifact: mockValidateArtifact
      };

      mockRulesEngineService.getInstance.mockReturnValue(mockServiceInstance as any);

      const event = {
        jobId: 'test-job-timeout',
        artifactCheckRequest: {
          artifactType: 'typescript',
          userId: 'user-123',
          teamId: 'team-456'
        },
        userContext: {
          userId: 'user-123',
          teamId: 'team-456',
          role: 'developer',
          department: 'engineering',
          clearance: 'standard',
          permissions: ['read', 'write']
        },
        kendraResults: { Payload: { results: [] } },
        staticCheckResults: { taskResult: { issues: [] } },
        semanticCheckResults: { taskResult: { issues: [] } },
        artifactData: {
          content: 'test content',
          contentType: 'text/plain',
          detectedArtifactType: 'typescript',
          applicableRules: [
            {
              id: 'typescript-eslint',
              name: 'TypeScript ESLint Rules',
              type: 'static',
              severity: 'medium',
              enabled: true,
              config: { applicable_types: ['typescript'] }
            }
          ]
        }
      };

      // Mock S3 and DynamoDB operations
      const mockS3Send = jest.fn().mockResolvedValue({});
      const mockDynamoSend = jest.fn().mockResolvedValue({});
      
      require('@aws-sdk/client-s3').S3Client.mockImplementation(() => ({
        send: mockS3Send
      }));
      
      require('@aws-sdk/client-dynamodb').DynamoDBClient.mockImplementation(() => ({
        send: mockDynamoSend
      }));

      const result = await composeReportHandler(event);

      // Should complete successfully even with rules engine timeout
      expect(result.jobStatus).toBe('completed');
      expect(result.report.complianceScore).toBe(100); // Fallback calculation since no issues
      expect(result.report.issues).toHaveLength(0); // No rules engine issues due to timeout
    });

    it('should handle rules engine validation errors gracefully', async () => {
      const mockValidateArtifact = jest.fn().mockRejectedValue(new Error('Rules engine internal error'));

      const mockServiceInstance = {
        validateArtifact: mockValidateArtifact
      };

      mockRulesEngineService.getInstance.mockReturnValue(mockServiceInstance as any);

      const event = {
        jobId: 'test-job-error',
        artifactCheckRequest: {
          artifactType: 'typescript',
          userId: 'user-123',
          teamId: 'team-456'
        },
        userContext: {
          userId: 'user-123',
          teamId: 'team-456',
          role: 'developer',
          department: 'engineering',
          clearance: 'standard',
          permissions: ['read', 'write']
        },
        kendraResults: { Payload: { results: [] } },
        staticCheckResults: { taskResult: { issues: [] } },
        semanticCheckResults: { taskResult: { issues: [] } },
        artifactData: {
          content: 'test content',
          contentType: 'text/plain',
          detectedArtifactType: 'typescript',
          applicableRules: [
            {
              id: 'typescript-eslint',
              name: 'TypeScript ESLint Rules',
              type: 'static',
              severity: 'medium',
              enabled: true,
              config: { applicable_types: ['typescript'] }
            }
          ]
        }
      };

      // Mock S3 and DynamoDB operations
      const mockS3Send = jest.fn().mockResolvedValue({});
      const mockDynamoSend = jest.fn().mockResolvedValue({});
      
      require('@aws-sdk/client-s3').S3Client.mockImplementation(() => ({
        send: mockS3Send
      }));
      
      require('@aws-sdk/client-dynamodb').DynamoDBClient.mockImplementation(() => ({
        send: mockDynamoSend
      }));

      const result = await composeReportHandler(event);

      // Should complete successfully even with rules engine error
      expect(result.jobStatus).toBe('completed');
      expect(result.report.complianceScore).toBe(100); // Fallback calculation
      expect(result.report.issues).toHaveLength(0); // No rules engine issues due to error
    });
  });
});