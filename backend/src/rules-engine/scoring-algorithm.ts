import { ValidationResult, SeverityWeights, ValidationReport } from './types';

export class ScoringAlgorithm {
  private static readonly DEFAULT_WEIGHTS: SeverityWeights = {
    critical: 100,
    high: 50,
    medium: 20,
    low: 5
  };

  private static readonly DEFAULT_PASSING_THRESHOLD = 0.8; // 80% score required to pass

  /**
   * Calculate the overall score for a validation report
   */
  static calculateScore(
    results: ValidationResult[],
    weights: SeverityWeights = ScoringAlgorithm.DEFAULT_WEIGHTS
  ): { score: number; maxScore: number; passed: boolean } {
    if (results.length === 0) {
      return { score: 100, maxScore: 100, passed: true };
    }

    let totalDeductions = 0;
    let maxPossibleScore = 0;
    let criticalFailures = 0;

    for (const result of results) {
      const weight = weights[result.severity];
      maxPossibleScore += weight;

      if (!result.passed) {
        totalDeductions += weight;
        if (result.severity === 'critical') {
          criticalFailures++;
        }
      }
    }

    // Calculate percentage score
    const score = Math.max(0, ((maxPossibleScore - totalDeductions) / maxPossibleScore) * 100);
    
    // Automatic failure for critical issues
    const passed = criticalFailures === 0 && score >= (ScoringAlgorithm.DEFAULT_PASSING_THRESHOLD * 100);

    return {
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      maxScore: 100,
      passed
    };
  }

  /**
   * Generate a summary of validation results
   */
  static generateSummary(results: ValidationResult[]) {
    const summary = {
      total_rules: results.length,
      passed_rules: 0,
      failed_rules: 0,
      critical_issues: 0,
      high_issues: 0,
      medium_issues: 0,
      low_issues: 0
    };

    for (const result of results) {
      if (result.passed) {
        summary.passed_rules++;
      } else {
        summary.failed_rules++;
        switch (result.severity) {
          case 'critical':
            summary.critical_issues++;
            break;
          case 'high':
            summary.high_issues++;
            break;
          case 'medium':
            summary.medium_issues++;
            break;
          case 'low':
            summary.low_issues++;
            break;
        }
      }
    }

    return summary;
  }

  /**
   * Create a complete validation report
   */
  static createReport(
    artifactId: string,
    results: ValidationResult[],
    executionTimeMs: number,
    weights?: SeverityWeights
  ): ValidationReport {
    const startTime = Date.now();
    const { score, maxScore, passed } = ScoringAlgorithm.calculateScore(results, weights);
    const summary = ScoringAlgorithm.generateSummary(results);

    return {
      artifact_id: artifactId,
      overall_score: score,
      max_score: maxScore,
      passed,
      results,
      summary,
      execution_time_ms: executionTimeMs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get recommended actions based on validation results
   */
  static getRecommendedActions(results: ValidationResult[]): string[] {
    const actions: string[] = [];
    const criticalIssues = results.filter(r => !r.passed && r.severity === 'critical');
    const highIssues = results.filter(r => !r.passed && r.severity === 'high');

    if (criticalIssues.length > 0) {
      actions.push(`Address ${criticalIssues.length} critical security/compliance issues immediately`);
    }

    if (highIssues.length > 0) {
      actions.push(`Review and fix ${highIssues.length} high-priority issues before deployment`);
    }

    const hasFixSuggestions = results.some(r => !r.passed && r.suggested_fix);
    if (hasFixSuggestions) {
      actions.push('Review suggested fixes for automated remediation opportunities');
    }

    if (actions.length === 0) {
      actions.push('All validation checks passed - artifact is ready for review');
    }

    return actions;
  }

  /**
   * Calculate risk level based on validation results
   */
  static calculateRiskLevel(results: ValidationResult[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = results.filter(r => !r.passed && r.severity === 'critical').length;
    const highCount = results.filter(r => !r.passed && r.severity === 'high').length;
    const mediumCount = results.filter(r => !r.passed && r.severity === 'medium').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'high';
    if (highCount > 0 || mediumCount > 5) return 'medium';
    return 'low';
  }
}