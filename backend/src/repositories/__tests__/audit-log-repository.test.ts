import { AuditLogRepository } from '../audit-log-repository';
import { CreateAuditLogInput, SecurityEvent, DataSourceAttribution } from '../../models';

// Mock the base repository
jest.mock('../base-repository');

describe('AuditLogRepository', () => {
  let repository: AuditLogRepository;
  let mockPutItem: jest.Mock;
  let mockQueryItems: jest.Mock;
  let mockScanItems: jest.Mock;

  beforeEach(() => {
    mockPutItem = jest.fn();
    mockQueryItems = jest.fn();
    mockScanItems = jest.fn();

    // Mock the base repository methods
    const BaseRepository = require('../base-repository').BaseRepository;
    BaseRepository.prototype.putItem = mockPutItem;
    BaseRepository.prototype.queryItems = mockQueryItems;
    BaseRepository.prototype.scanItems = mockScanItems;
    BaseRepository.prototype.validateRequiredFields = jest.fn();
    BaseRepository.prototype.getCurrentTimestamp = jest.fn(() => '2024-01-01T00:00:00.000Z');
    BaseRepository.prototype.getTTL = jest.fn(() => 1234567890);

    repository = new AuditLogRepository({
      region: 'us-east-1',
      tableName: 'test-audit-log-table',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a comprehensive audit log entry', async () => {
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
            snippet: 'Code review guidelines...',
          },
        ],
        result_summary: 'Artifact passed all checks',
        compliance_score: 85,
        team_id: 'team-001',
        action_category: 'artifact_check',
        security_event: {
          event_type: 'data_access',
          severity: 'medium',
          resource_accessed: 'confluence-doc',
          risk_score: 45,
        },
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
        compliance_flags: ['security_review'],
        policy_violations: [],
        performance_metrics: {
          execution_time_ms: 1500,
          api_calls_made: 3,
          error_count: 0,
        },
      };

      mockPutItem.mockResolvedValue(undefined);

      const result = await repository.create(input);

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'req-001',
          sk: '2024-01-01T00:00:00.000Z',
          entity_type: 'audit_log',
          gsi1pk: 'user-001',
          gsi2pk: 'artifact-check',
          gsi3pk: 'team-001',
          request_id: 'req-001',
          user_id: 'user-001',
          action: 'artifact-check',
          compliance_score: 85,
          security_event: input.security_event,
          data_sources: input.data_sources,
          performance_metrics: expect.objectContaining({
            execution_time_ms: 1500,
            api_calls_made: 3,
            error_count: 0,
          }),
        })
      );

      expect(result).toEqual(
        expect.objectContaining({
          request_id: 'req-001',
          user_id: 'user-001',
          action: 'artifact-check',
          compliance_score: 85,
        })
      );
    });

    it('should set default values for missing fields', async () => {
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
            snippet: 'Discussion about deployment...',
          },
        ],
        result_summary: 'Query completed successfully',
        compliance_score: 92,
      };

      mockPutItem.mockResolvedValue(undefined);

      const result = await repository.create(input);

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          action_category: 'query', // Auto-categorized
          data_sources: expect.arrayContaining([
            expect.objectContaining({
              source_system: 'slack',
              source_id: 'slack-001',
              data_classification: 'confidential', // Auto-classified
            }),
          ]),
          performance_metrics: expect.objectContaining({
            execution_time_ms: 0,
            api_calls_made: 1, // Based on references length
            error_count: 0,
          }),
        })
      );
    });
  });

  describe('getSecurityEvents', () => {
    it('should retrieve security events with severity filter', async () => {
      const mockItems = [
        {
          pk: 'req-001',
          sk: '2024-01-01T00:00:00.000Z',
          entity_type: 'audit_log',
          request_id: 'req-001',
          security_event: {
            event_type: 'authentication',
            severity: 'high',
          },
        },
      ];

      mockScanItems.mockResolvedValue({
        items: mockItems,
        count: 1,
        scanned_count: 1,
      });

      const result = await repository.getSecurityEvents('high');

      expect(mockScanItems).toHaveBeenCalledWith(
        expect.stringContaining('security_event.severity = :severity'),
        expect.any(Object),
        expect.objectContaining({
          ':severity': 'high',
        }),
        undefined,
        undefined
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          request_id: 'req-001',
        })
      );
    });
  });

  describe('getPolicyViolations', () => {
    it('should retrieve audit logs with policy violations', async () => {
      const mockItems = [
        {
          pk: 'req-001',
          sk: '2024-01-01T00:00:00.000Z',
          entity_type: 'audit_log',
          request_id: 'req-001',
          policy_violations: ['policy-001', 'policy-002'],
        },
      ];

      mockScanItems.mockResolvedValue({
        items: mockItems,
        count: 1,
        scanned_count: 1,
      });

      const result = await repository.getPolicyViolations('policy-001');

      expect(mockScanItems).toHaveBeenCalledWith(
        expect.stringContaining('contains(policy_violations, :policy_id)'),
        expect.any(Object),
        expect.objectContaining({
          ':policy_id': 'policy-001',
        }),
        undefined,
        undefined
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          request_id: 'req-001',
        })
      );
    });
  });

  describe('getByTeam', () => {
    it('should retrieve audit logs by team with timestamp range', async () => {
      const mockItems = [
        {
          pk: 'req-001',
          sk: '2024-01-01T00:00:00.000Z',
          entity_type: 'audit_log',
          gsi3pk: 'team-001',
          request_id: 'req-001',
          team_id: 'team-001',
        },
      ];

      mockQueryItems.mockResolvedValue({
        items: mockItems,
        count: 1,
        scanned_count: 1,
        last_evaluated_key: undefined,
      });

      const result = await repository.getByTeam(
        'team-001',
        '2024-01-01T00:00:00.000Z',
        '2024-01-02T00:00:00.000Z'
      );

      expect(mockQueryItems).toHaveBeenCalledWith(
        'gsi3pk = :team_id AND gsi3sk BETWEEN :start_timestamp AND :end_timestamp',
        undefined,
        {
          ':team_id': 'team-001',
          ':start_timestamp': '2024-01-01T00:00:00.000Z',
          ':end_timestamp': '2024-01-02T00:00:00.000Z',
        },
        undefined,
        'team-index',
        undefined,
        undefined,
        false
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          request_id: 'req-001',
          team_id: 'team-001',
        })
      );
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate a comprehensive compliance report', async () => {
      // Mock statistics
      mockScanItems.mockResolvedValue({
        items: [
          {
            entity_type: 'audit_log',
            compliance_score: 85,
            action: 'artifact-check',
            persona: 'tech-lead',
            team_id: 'team-001',
            security_event: { event_type: 'data_access', severity: 'medium' },
            policy_violations: ['policy-001'],
            data_sources: [{ source_system: 'confluence' }],
          },
          {
            entity_type: 'audit_log',
            compliance_score: 92,
            action: 'query',
            persona: 'dev-lead',
            team_id: 'team-002',
            security_event: { event_type: 'authentication', severity: 'low' },
            policy_violations: [],
            data_sources: [{ source_system: 'slack' }],
          },
        ],
        count: 2,
        scanned_count: 2,
      });

      const report = await repository.generateComplianceReport(
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.999Z',
        'admin-user'
      );

      expect(report).toEqual(
        expect.objectContaining({
          report_id: expect.stringMatching(/^compliance-\d+$/),
          generated_by: 'admin-user',
          report_period: {
            start_date: '2024-01-01T00:00:00.000Z',
            end_date: '2024-01-31T23:59:59.999Z',
          },
          summary: expect.objectContaining({
            total_actions: 2,
            average_compliance_score: 88.5,
            policy_violations: 1,
            security_events: 2,
          }),
          compliance_metrics: expect.objectContaining({
            score_distribution: expect.any(Object),
            trend_analysis: expect.any(Array),
            top_violations: expect.any(Array),
          }),
          security_analysis: expect.objectContaining({
            event_distribution: expect.any(Object),
            high_risk_events: expect.any(Array),
          }),
          recommendations: expect.any(Array),
        })
      );
    });
  });

  describe('getStatistics', () => {
    it('should return comprehensive audit statistics', async () => {
      const mockItems = [
        {
          entity_type: 'audit_log',
          compliance_score: 85,
          action: 'artifact-check',
          persona: 'tech-lead',
          team_id: 'team-001',
          security_event: { event_type: 'data_access', severity: 'medium' },
          policy_violations: ['policy-001'],
          data_sources: [{ source_system: 'confluence' }],
        },
        {
          entity_type: 'audit_log',
          compliance_score: 95,
          action: 'query',
          persona: 'dev-lead',
          team_id: 'team-001',
          security_event: null,
          policy_violations: [],
          data_sources: [{ source_system: 'slack' }],
        },
      ];

      mockScanItems.mockResolvedValue({
        items: mockItems,
        count: 2,
        scanned_count: 2,
      });

      // Mock trend data generation
      repository['generateTrendData'] = jest.fn().mockResolvedValue({
        daily_activity: [],
        weekly_violations: [],
        monthly_compliance: [],
      });

      const stats = await repository.getStatistics();

      expect(stats).toEqual(
        expect.objectContaining({
          totalEntries: 2,
          averageComplianceScore: 90,
          actionCounts: {
            'artifact-check': 1,
            'query': 1,
          },
          personaCounts: {
            'tech-lead': 1,
            'dev-lead': 1,
          },
          teamCounts: {
            'team-001': 2,
          },
          complianceScoreDistribution: {
            excellent: 1, // score >= 90
            good: 1,      // score >= 70
            fair: 0,      // score >= 50
            poor: 0,      // score < 50
          },
          securityEventCounts: {
            'data_access-medium': 1,
          },
          policyViolationCounts: {
            'policy-001': 1,
          },
          dataSourceUsage: {
            'confluence': 1,
            'slack': 1,
          },
        })
      );
    });
  });
});