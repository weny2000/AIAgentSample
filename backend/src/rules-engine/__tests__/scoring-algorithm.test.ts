import { ScoringAlgorithm } from '../scoring-algorithm';
import { ValidationResult } from '../types';

describe('ScoringAlgorithm', () => {
  const mockResults: ValidationResult[] = [
    {
      rule_id: 'test-rule-1',
      rule_name: 'Test Rule 1',
      passed: true,
      severity: 'medium',
      message: 'Test passed'
    },
    {
      rule_id: 'test-rule-2',
      rule_name: 'Test Rule 2',
      passed: false,
      severity: 'high',
      message: 'Test failed'
    },
    {
      rule_id: 'test-rule-3',
      rule_name: 'Test Rule 3',
      passed: false,
      severity: 'critical',
      message: 'Critical failure'
    },
    {
      rule_id: 'test-rule-4',
      rule_name: 'Test Rule 4',
      passed: false,
      severity: 'low',
      message: 'Minor issue'
    }
  ];

  describe('calculateScore', () => {
    it('should calculate correct score with default weights', () => {
      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(mockResults);
      
      // Total possible: 20 (medium) + 50 (high) + 100 (critical) + 5 (low) = 175
      // Deductions: 50 (high) + 100 (critical) + 5 (low) = 155
      // Score: (175 - 155) / 175 * 100 = 11.43%
      expect(score).toBeCloseTo(11.43, 1);
      expect(maxScore).toBe(100);
      expect(passed).toBe(false); // Critical failure should cause automatic failure
    });

    it('should return 100% score for all passing results', () => {
      const passingResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: true,
          severity: 'high',
          message: 'Test passed'
        },
        {
          rule_id: 'test-rule-2',
          rule_name: 'Test Rule 2',
          passed: true,
          severity: 'medium',
          message: 'Test passed'
        }
      ];

      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(passingResults);
      
      expect(score).toBe(100);
      expect(maxScore).toBe(100);
      expect(passed).toBe(true);
    });

    it('should return 100% score for empty results', () => {
      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore([]);
      
      expect(score).toBe(100);
      expect(maxScore).toBe(100);
      expect(passed).toBe(true);
    });

    it('should use custom weights correctly', () => {
      const customWeights = {
        critical: 200,
        high: 100,
        medium: 40,
        low: 10
      };

      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(mockResults, customWeights);
      
      // Total possible: 40 (medium) + 100 (high) + 200 (critical) + 10 (low) = 350
      // Deductions: 100 (high) + 200 (critical) + 10 (low) = 310
      // Score: (350 - 310) / 350 * 100 = 11.43%
      expect(score).toBeCloseTo(11.43, 1);
      expect(maxScore).toBe(100);
      expect(passed).toBe(false);
    });

    it('should fail automatically with critical issues', () => {
      const criticalResults: ValidationResult[] = [
        {
          rule_id: 'critical-rule',
          rule_name: 'Critical Rule',
          passed: false,
          severity: 'critical',
          message: 'Critical failure'
        }
      ];

      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(criticalResults);
      
      expect(score).toBe(0);
      expect(maxScore).toBe(100);
      expect(passed).toBe(false);
    });

    it('should pass with high score and no critical issues', () => {
      const goodResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: true,
          severity: 'high',
          message: 'Test passed'
        },
        {
          rule_id: 'test-rule-2',
          rule_name: 'Test Rule 2',
          passed: false,
          severity: 'low',
          message: 'Minor issue'
        }
      ];

      const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(goodResults);
      
      // Total possible: 50 (high) + 5 (low) = 55
      // Deductions: 5 (low) = 5
      // Score: (55 - 5) / 55 * 100 = 90.91%
      expect(score).toBeCloseTo(90.91, 1);
      expect(maxScore).toBe(100);
      expect(passed).toBe(true); // Above 80% threshold and no critical issues
    });
  });

  describe('generateSummary', () => {
    it('should generate correct summary statistics', () => {
      const summary = ScoringAlgorithm.generateSummary(mockResults);
      
      expect(summary.total_rules).toBe(4);
      expect(summary.passed_rules).toBe(1);
      expect(summary.failed_rules).toBe(3);
      expect(summary.critical_issues).toBe(1);
      expect(summary.high_issues).toBe(1);
      expect(summary.medium_issues).toBe(0);
      expect(summary.low_issues).toBe(1);
    });

    it('should handle empty results', () => {
      const summary = ScoringAlgorithm.generateSummary([]);
      
      expect(summary.total_rules).toBe(0);
      expect(summary.passed_rules).toBe(0);
      expect(summary.failed_rules).toBe(0);
      expect(summary.critical_issues).toBe(0);
      expect(summary.high_issues).toBe(0);
      expect(summary.medium_issues).toBe(0);
      expect(summary.low_issues).toBe(0);
    });
  });

  describe('createReport', () => {
    it('should create a complete validation report', () => {
      const artifactId = 'test-artifact-123';
      const executionTime = 1500;
      
      const report = ScoringAlgorithm.createReport(artifactId, mockResults, executionTime);
      
      expect(report.artifact_id).toBe(artifactId);
      expect(report.execution_time_ms).toBe(executionTime);
      expect(report.results).toEqual(mockResults);
      expect(report.overall_score).toBeCloseTo(11.43, 1);
      expect(report.max_score).toBe(100);
      expect(report.passed).toBe(false);
      expect(report.summary.total_rules).toBe(4);
      expect(report.timestamp).toBeDefined();
      expect(new Date(report.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('getRecommendedActions', () => {
    it('should recommend actions for critical and high issues', () => {
      const actions = ScoringAlgorithm.getRecommendedActions(mockResults);
      
      expect(actions).toContain('Address 1 critical security/compliance issues immediately');
      expect(actions).toContain('Review and fix 1 high-priority issues before deployment');
    });

    it('should recommend reviewing fixes when available', () => {
      const resultsWithFixes: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: false,
          severity: 'medium',
          message: 'Test failed',
          suggested_fix: 'Fix this issue by doing X'
        }
      ];

      const actions = ScoringAlgorithm.getRecommendedActions(resultsWithFixes);
      
      expect(actions).toContain('Review suggested fixes for automated remediation opportunities');
    });

    it('should indicate success when all tests pass', () => {
      const passingResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: true,
          severity: 'high',
          message: 'Test passed'
        }
      ];

      const actions = ScoringAlgorithm.getRecommendedActions(passingResults);
      
      expect(actions).toContain('All validation checks passed - artifact is ready for review');
    });
  });

  describe('calculateRiskLevel', () => {
    it('should return critical risk for critical issues', () => {
      const riskLevel = ScoringAlgorithm.calculateRiskLevel(mockResults);
      expect(riskLevel).toBe('critical');
    });

    it('should return high risk for multiple high issues', () => {
      const highRiskResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: false,
          severity: 'high',
          message: 'High issue 1'
        },
        {
          rule_id: 'test-rule-2',
          rule_name: 'Test Rule 2',
          passed: false,
          severity: 'high',
          message: 'High issue 2'
        },
        {
          rule_id: 'test-rule-3',
          rule_name: 'Test Rule 3',
          passed: false,
          severity: 'high',
          message: 'High issue 3'
        }
      ];

      const riskLevel = ScoringAlgorithm.calculateRiskLevel(highRiskResults);
      expect(riskLevel).toBe('high');
    });

    it('should return medium risk for some high or many medium issues', () => {
      const mediumRiskResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: false,
          severity: 'high',
          message: 'High issue'
        },
        {
          rule_id: 'test-rule-2',
          rule_name: 'Test Rule 2',
          passed: false,
          severity: 'medium',
          message: 'Medium issue'
        }
      ];

      const riskLevel = ScoringAlgorithm.calculateRiskLevel(mediumRiskResults);
      expect(riskLevel).toBe('medium');
    });

    it('should return low risk for minor issues only', () => {
      const lowRiskResults: ValidationResult[] = [
        {
          rule_id: 'test-rule-1',
          rule_name: 'Test Rule 1',
          passed: false,
          severity: 'low',
          message: 'Low issue'
        },
        {
          rule_id: 'test-rule-2',
          rule_name: 'Test Rule 2',
          passed: false,
          severity: 'medium',
          message: 'Medium issue'
        }
      ];

      const riskLevel = ScoringAlgorithm.calculateRiskLevel(lowRiskResults);
      expect(riskLevel).toBe('low');
    });
  });
});