import { AuditService } from '../audit-service';
import { AuditLogRepository } from '../../repositories/audit-log-repository';
import { CreateAuditLogInput, SecurityEvent, AuditLog } from '../../models';

// Mock the repository
jest.mock('../../repositories/audit-log-repository');
jest.mock('../../lambda/utils/logger');

describe('AuditService', () => {
  let auditService: AuditService;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    mockAuditLogRepository = {
      create: jest.fn(),
      getByUserId: jest.fn(),
      getByTeam: jest.fn(),
      getByAction: jest.fn(),
      getRecent: jest.fn(),
      getSecurityEvents: jest.fn(),
      generateComplianceReport: jest.fn(),
      getStatistics: jest.fn(),
    } as any;

    const mockRepositories = {
      auditLogRepository: mockAuditLogRepository,
    } as any;

    auditService = new AuditService({
      repositories: mockRepositories,
      retentionPolicyDays: 365,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should create an enhanced audit log entry', async () => {
      const input: CreateAuditLogInput = {
        request_id: 'req-001',
        user_id: 'user-001',
        persona: 'tech-lead',
        action: 'artifact-check',
        references: [
          {
            source_id: 'doc-001',
            source_type: 'confluence',
            confidence_score: 0.95,
            snippet: 'Code review guidelines for TypeScript services...',
          },
        ],
        result_summary: 'Artifact passed all checks',
        compliance_score: 85,
      };

      const expectedAuditLog: AuditLog = {
        ...input,
        timestamp: '2024-01-01T00:00:00.000Z',
        action_category: 'artifact_check',
        data_sources: [
          {
            source_system: 'confluence',
            source_id: 'doc-001',
            data_classification: 'internal',
            access_level_required: 'user',
            pii_detected: false,
            sensitive_data_types: [],
          },
        ],
        compliance_flags: [],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 1,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      const result = await auditService.logAction(input);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...input,
          action_category: 'artifact_check',
          data_sources: expect.arrayContaining([
            expect.objectContaining({
              source_system: 'confluence',
              data_classification: 'internal',
              pii_detected: false,
            }),
          ]),
          performance_metrics: expect.objectContaining({
            api_calls_made: 1,
            error_count: 0,
          }),
        })
      );

      expect(result).toEqual(expectedAuditLog);
    });

    it('should detect PII in reference snippets', async () => {
      const input: CreateAuditLogInput = {
        request_id: 'req-002',
        user_id: 'user-002',
        persona: 'dev-lead',
        action: 'query-knowledge-base',
        references: [
          {
            source_id: 'slack-001',
            source_type: 'slack',
            confidence_score: 0.8,
            snippet: 'Contact John Doe at john.doe@company.com or 555-123-4567',
          },
        ],
        result_summary: 'Query completed',
        compliance_score: 75,
      };

      const expectedAuditLog: AuditLog = {
        ...input,
        timestamp: '2024-01-01T00:00:00.000Z',
        action_category: 'query',
        data_sources: [],
        compliance_flags: [],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 1,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      await auditService.logAction(input);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data_sources: expect.arrayContaining([
            expect.objectContaining({
              pii_detected: true,
              sensitive_data_types: expect.arrayContaining(['email', 'phone']),
            }),
          ]),
        })
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log a security event with proper categorization', async () => {
      const baseInput: CreateAuditLogInput = {
        request_id: 'req-003',
        user_id: 'user-003',
        persona: 'security-lead',
        action: 'unauthorized-access-attempt',
        references: [],
        result_summary: 'Access denied',
        compliance_score: 0,
      };

      const securityEvent: SecurityEvent = {
        event_type: 'authorization',
        severity: 'high',
        source_ip: '192.168.1.100',
        user_agent: 'Mozilla/5.0...',
        resource_accessed: '/admin/users',
        permission_requested: 'admin:read',
        risk_score: 85,
      };

      const expectedAuditLog: AuditLog = {
        ...baseInput,
        timestamp: '2024-01-01T00:00:00.000Z',
        security_event: securityEvent,
        action_category: 'system_operation',
        action_subcategory: 'security_event',
        compliance_flags: ['security_event', 'severity_high'],
        data_sources: [],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 0,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      const result = await auditService.logSecurityEvent(baseInput, securityEvent);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          security_event: securityEvent,
          action_category: 'system_operation',
          action_subcategory: 'security_event',
          compliance_flags: ['security_event', 'severity_high'],
        })
      );

      expect(result).toEqual(expectedAuditLog);
    });
  });

  describe('logPolicyViolation', () => {
    it('should log policy violations with reduced compliance score', async () => {
      const baseInput: CreateAuditLogInput = {
        request_id: 'req-004',
        user_id: 'user-004',
        persona: 'dev-lead',
        action: 'artifact-submission',
        references: [],
        result_summary: 'Artifact submitted',
        compliance_score: 85,
      };

      const violatedPolicies = ['security-policy-001', 'code-quality-policy-002'];
      const violationDetails = 'Missing security headers and code coverage below threshold';

      const expectedAuditLog: AuditLog = {
        ...baseInput,
        timestamp: '2024-01-01T00:00:00.000Z',
        policy_violations: violatedPolicies,
        compliance_flags: ['policy_violation'],
        result_summary: `${baseInput.result_summary}. Policy violations: ${violationDetails}`,
        compliance_score: 40, // Capped for violations
        data_sources: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 0,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      const result = await auditService.logPolicyViolation(
        baseInput,
        violatedPolicies,
        violationDetails
      );

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_violations: violatedPolicies,
          compliance_flags: ['policy_violation'],
          compliance_score: 40,
          result_summary: expect.stringContaining(violationDetails),
        })
      );

      expect(result.compliance_score).toBe(40);
    });
  });

  describe('logDataAccess', () => {
    it('should log restricted data access with high-risk security event', async () => {
      const baseInput: CreateAuditLogInput = {
        request_id: 'req-005',
        user_id: 'user-005',
        persona: 'analyst',
        action: 'access-sensitive-data',
        references: [],
        result_summary: 'Data accessed successfully',
        compliance_score: 90,
      };

      const expectedAuditLog: AuditLog = {
        ...baseInput,
        timestamp: '2024-01-01T00:00:00.000Z',
        action_category: 'data_access',
        security_event: {
          event_type: 'data_access',
          severity: 'high',
          resource_accessed: 'unknown',
          risk_score: 90,
        },
        compliance_flags: ['pii_access'],
        data_sources: [],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 0,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      const result = await auditService.logDataAccess(baseInput, 'restricted', true);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_category: 'data_access',
          security_event: expect.objectContaining({
            event_type: 'data_access',
            severity: 'high',
            risk_score: expect.any(Number),
          }),
          compliance_flags: ['pii_access'],
        })
      );

      expect(result.security_event?.severity).toBe('high');
    });

    it('should log internal data access without security event', async () => {
      const baseInput: CreateAuditLogInput = {
        request_id: 'req-006',
        user_id: 'user-006',
        persona: 'developer',
        action: 'read-documentation',
        references: [],
        result_summary: 'Documentation accessed',
        compliance_score: 95,
      };

      const expectedAuditLog: AuditLog = {
        ...baseInput,
        timestamp: '2024-01-01T00:00:00.000Z',
        action_category: 'data_access',
        data_sources: [],
        compliance_flags: [],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 0,
          api_calls_made: 0,
          error_count: 0,
        },
        request_context: {},
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

      const result = await auditService.logDataAccess(baseInput, 'internal', false);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_category: 'data_access',
          security_event: undefined,
          compliance_flags: [],
        })
      );

      expect(result.security_event).toBeUndefined();
    });
  });

  describe('queryAuditLogs', () => {
    it('should query audit logs by user with additional filters', async () => {
      const params = {
        user_id: 'user-001',
        compliance_score_min: 80,
        security_event_severity: 'high' as const,
        limit: 10,
      };

      const mockResponse = {
        items: [
          {
            request_id: 'req-001',
            user_id: 'user-001',
            compliance_score: 85,
            security_event: { severity: 'high' },
          } as AuditLog,
          {
            request_id: 'req-002',
            user_id: 'user-001',
            compliance_score: 75, // Below min threshold
            security_event: { severity: 'medium' }, // Wrong severity
          } as AuditLog,
        ],
        count: 2,
        scanned_count: 2,
        last_evaluated_key: undefined,
      };

      mockAuditLogRepository.getByUserId.mockResolvedValue(mockResponse);

      const result = await auditService.queryAuditLogs(params);

      expect(mockAuditLogRepository.getByUserId).toHaveBeenCalledWith(params);
      
      // Should filter out the second item due to compliance score and severity
      expect(result.items).toHaveLength(1);
      expect(result.items[0].request_id).toBe('req-001');
      
      // Should include aggregations
      expect(result.aggregations).toBeDefined();
      expect(result.aggregations?.total_entries).toBe(1);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate a comprehensive compliance report', async () => {
      const mockReport = {
        report_id: 'compliance-123',
        generated_at: '2024-01-01T00:00:00.000Z',
        generated_by: 'admin-user',
        report_period: {
          start_date: '2024-01-01T00:00:00.000Z',
          end_date: '2024-01-31T23:59:59.999Z',
        },
        summary: {
          total_actions: 100,
          total_users: 10,
          total_teams: 5,
          average_compliance_score: 85,
          policy_violations: 5,
          security_events: 3,
        },
        compliance_metrics: {
          score_distribution: {},
          trend_analysis: [],
          top_violations: [],
        },
        security_analysis: {
          event_distribution: {},
          high_risk_events: [],
          user_risk_scores: [],
        },
        data_governance: {
          data_source_usage: {},
          pii_access_events: 2,
          retention_compliance: {
            compliant_records: 95,
            expired_records: 3,
            pending_deletion: 2,
          },
        },
        recommendations: [],
      };

      mockAuditLogRepository.generateComplianceReport.mockResolvedValue(mockReport);
      mockAuditLogRepository.getSecurityEvents.mockResolvedValue([]);

      const result = await auditService.generateComplianceReport(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.999Z',
        'admin-user',
        true
      );

      expect(mockAuditLogRepository.generateComplianceReport).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.999Z',
        'admin-user'
      );

      expect(result).toEqual(mockReport);
    });
  });

  describe('getSecurityEvents', () => {
    it('should retrieve and sort security events by risk score', async () => {
      const mockEvents = [
        {
          request_id: 'req-001',
          security_event: { risk_score: 75 },
        } as AuditLog,
        {
          request_id: 'req-002',
          security_event: { risk_score: 90 },
        } as AuditLog,
        {
          request_id: 'req-003',
          security_event: { risk_score: 60 },
        } as AuditLog,
      ];

      mockAuditLogRepository.getSecurityEvents.mockResolvedValue(mockEvents);

      const result = await auditService.getSecurityEvents('high');

      expect(mockAuditLogRepository.getSecurityEvents).toHaveBeenCalledWith(
        'high',
        undefined,
        undefined,
        undefined
      );

      // Should be sorted by risk score descending
      expect(result[0].security_event?.risk_score).toBe(90);
      expect(result[1].security_event?.risk_score).toBe(75);
      expect(result[2].security_event?.risk_score).toBe(60);
    });
  });

  describe('data classification and PII detection', () => {
    it('should correctly classify different data sources', async () => {
      const testCases = [
        { sourceType: 'confluence', expected: 'internal' },
        { sourceType: 'slack', expected: 'confidential' },
        { sourceType: 'internal-policy', expected: 'restricted' },
        { sourceType: 'git', expected: 'internal' },
      ];

      for (const testCase of testCases) {
        const input: CreateAuditLogInput = {
          request_id: `req-${testCase.sourceType}`,
          user_id: 'user-001',
          persona: 'test-persona',
          action: 'test-action',
          references: [
            {
              source_id: 'test-001',
              source_type: testCase.sourceType as any,
              confidence_score: 0.9,
              snippet: 'Test content',
            },
          ],
          result_summary: 'Test result',
          compliance_score: 80,
        };

        const expectedAuditLog: AuditLog = {
          ...input,
          timestamp: '2024-01-01T00:00:00.000Z',
          data_sources: [],
          compliance_flags: [],
          policy_violations: [],
          performance_metrics: {
            execution_time_ms: 0,
            api_calls_made: 1,
            error_count: 0,
          },
          request_context: {},
          created_at: '2024-01-01T00:00:00.000Z',
        };

        mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

        await auditService.logAction(input);

        expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data_sources: expect.arrayContaining([
              expect.objectContaining({
                data_classification: testCase.expected,
              }),
            ]),
          })
        );
      }
    });

    it('should detect various PII patterns', async () => {
      const piiTestCases = [
        { text: 'SSN: 123-45-6789', expectedTypes: ['ssn'] },
        { text: 'Email: test@example.com', expectedTypes: ['email'] },
        { text: 'Phone: 555-123-4567', expectedTypes: ['phone'] },
        { text: 'Card: 4111-1111-1111-1111', expectedTypes: ['credit_card'] },
        { text: 'Contact: john@test.com, 555-999-8888', expectedTypes: ['email', 'phone'] },
      ];

      for (const testCase of piiTestCases) {
        const input: CreateAuditLogInput = {
          request_id: 'req-pii-test',
          user_id: 'user-001',
          persona: 'test-persona',
          action: 'test-action',
          references: [
            {
              source_id: 'test-001',
              source_type: 'confluence',
              confidence_score: 0.9,
              snippet: testCase.text,
            },
          ],
          result_summary: 'Test result',
          compliance_score: 80,
        };

        const expectedAuditLog: AuditLog = {
          ...input,
          timestamp: '2024-01-01T00:00:00.000Z',
          data_sources: [],
          compliance_flags: [],
          policy_violations: [],
          performance_metrics: {
            execution_time_ms: 0,
            api_calls_made: 1,
            error_count: 0,
          },
          request_context: {},
          created_at: '2024-01-01T00:00:00.000Z',
        };

        mockAuditLogRepository.create.mockResolvedValue(expectedAuditLog);

        await auditService.logAction(input);

        expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data_sources: expect.arrayContaining([
              expect.objectContaining({
                pii_detected: true,
                sensitive_data_types: expect.arrayContaining(testCase.expectedTypes),
              }),
            ]),
          })
        );
      }
    });
  });
});