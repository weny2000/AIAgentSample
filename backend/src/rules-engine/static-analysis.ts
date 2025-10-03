import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ValidationResult, StaticAnalysisConfig, ArtifactValidationRequest } from './types';

const execAsync = promisify(exec);

export class StaticAnalysisEngine {
  private config: StaticAnalysisConfig;
  private tempDir: string;

  constructor(config: StaticAnalysisConfig, tempDir: string = '/tmp') {
    this.config = config;
    this.tempDir = tempDir;
  }

  /**
   * Run all enabled static analysis tools
   */
  async runAnalysis(request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const tempFilePath = await this.createTempFile(request);

    try {
      if (this.config.eslint?.enabled) {
        const eslintResults = await this.runESLint(tempFilePath, request);
        results.push(...eslintResults);
      }

      if (this.config.cfn_lint?.enabled) {
        const cfnLintResults = await this.runCfnLint(tempFilePath, request);
        results.push(...cfnLintResults);
      }

      if (this.config.cfn_nag?.enabled) {
        const cfnNagResults = await this.runCfnNag(tempFilePath, request);
        results.push(...cfnNagResults);
      }

      if (this.config.snyk?.enabled) {
        const snykResults = await this.runSnyk(tempFilePath, request);
        results.push(...snykResults);
      }
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        console.warn('Failed to clean up temp file:', tempFilePath, error);
      }
    }

    return results;
  }

  /**
   * Create temporary file for analysis
   */
  private async createTempFile(request: ArtifactValidationRequest): Promise<string> {
    const extension = this.getFileExtension(request.artifact_type, request.file_path);
    const tempFileName = `artifact_${request.artifact_id}_${Date.now()}${extension}`;
    const tempFilePath = path.join(this.tempDir, tempFileName);
    
    await fs.writeFile(tempFilePath, request.content, 'utf8');
    return tempFilePath;
  }

  /**
   * Get appropriate file extension based on artifact type
   */
  private getFileExtension(artifactType: string, filePath?: string): string {
    if (filePath) {
      return path.extname(filePath);
    }

    const extensionMap: Record<string, string> = {
      'typescript': '.ts',
      'javascript': '.js',
      'cloudformation': '.yaml',
      'terraform': '.tf',
      'dockerfile': '.dockerfile',
      'json': '.json',
      'yaml': '.yaml'
    };

    return extensionMap[artifactType.toLowerCase()] || '.txt';
  }

  /**
   * Run ESLint analysis
   */
  private async runESLint(filePath: string, request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    try {
      const configPath = this.config.eslint?.config_path || '';
      const configFlag = configPath ? `--config ${configPath}` : '';
      const command = `npx eslint ${configFlag} --format json ${filePath}`;
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stdout) {
        return [{
          rule_id: 'eslint-error',
          rule_name: 'ESLint Execution Error',
          passed: false,
          severity: 'high',
          message: `ESLint failed to run: ${stderr}`,
          details: { error: stderr }
        }];
      }

      const eslintOutput = JSON.parse(stdout || '[]');
      const results: ValidationResult[] = [];

      for (const file of eslintOutput) {
        for (const message of file.messages || []) {
          results.push({
            rule_id: `eslint-${message.ruleId || 'unknown'}`,
            rule_name: `ESLint: ${message.ruleId || 'Unknown Rule'}`,
            passed: false,
            severity: this.mapESLintSeverity(message.severity),
            message: message.message,
            source_location: {
              file: request.file_path,
              line: message.line,
              column: message.column
            },
            details: {
              rule_id: message.ruleId,
              node_type: message.nodeType
            },
            suggested_fix: message.fix ? 'Auto-fixable with ESLint --fix' : undefined
          });
        }
      }

      return results;
    } catch (error) {
      return [{
        rule_id: 'eslint-error',
        rule_name: 'ESLint Execution Error',
        passed: false,
        severity: 'medium',
        message: `Failed to run ESLint: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }];
    }
  }

  /**
   * Run CloudFormation Lint analysis
   */
  private async runCfnLint(filePath: string, request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    try {
      const ignoreChecks = this.config.cfn_lint?.ignore_checks || [];
      const ignoreFlag = ignoreChecks.length > 0 ? `--ignore-checks ${ignoreChecks.join(',')}` : '';
      const command = `cfn-lint ${ignoreFlag} --format json ${filePath}`;
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stdout) {
        return [{
          rule_id: 'cfn-lint-error',
          rule_name: 'CloudFormation Lint Error',
          passed: false,
          severity: 'high',
          message: `cfn-lint failed to run: ${stderr}`,
          details: { error: stderr }
        }];
      }

      const cfnLintOutput = JSON.parse(stdout || '[]');
      const results: ValidationResult[] = [];

      for (const issue of cfnLintOutput) {
        results.push({
          rule_id: `cfn-lint-${issue.Rule.Id}`,
          rule_name: `CFN-Lint: ${issue.Rule.Description}`,
          passed: false,
          severity: this.mapCfnLintSeverity(issue.Level),
          message: issue.Message,
          source_location: {
            file: request.file_path,
            line: issue.Location?.Start?.LineNumber,
            column: issue.Location?.Start?.ColumnNumber
          },
          details: {
            rule_id: issue.Rule.Id,
            rule_url: issue.Rule.ShortDescription
          }
        });
      }

      return results;
    } catch (error) {
      return [{
        rule_id: 'cfn-lint-error',
        rule_name: 'CloudFormation Lint Error',
        passed: false,
        severity: 'medium',
        message: `Failed to run cfn-lint: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }];
    }
  }

  /**
   * Run CloudFormation NAG analysis
   */
  private async runCfnNag(filePath: string, request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    try {
      const ruleDir = this.config.cfn_nag?.rule_directory || '';
      const ruleDirFlag = ruleDir ? `--rule-directory ${ruleDir}` : '';
      const command = `cfn_nag_scan ${ruleDirFlag} --output-format json --input-path ${filePath}`;
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stdout) {
        return [{
          rule_id: 'cfn-nag-error',
          rule_name: 'CloudFormation NAG Error',
          passed: false,
          severity: 'high',
          message: `cfn_nag failed to run: ${stderr}`,
          details: { error: stderr }
        }];
      }

      const cfnNagOutput = JSON.parse(stdout || '[]');
      const results: ValidationResult[] = [];

      for (const file of cfnNagOutput) {
        // Process violations (failures)
        for (const violation of file.file_results?.violation || []) {
          results.push({
            rule_id: `cfn-nag-${violation.id}`,
            rule_name: `CFN-NAG: ${violation.message}`,
            passed: false,
            severity: 'high',
            message: violation.message,
            source_location: {
              file: request.file_path,
              line: violation.line_numbers?.[0]
            },
            details: {
              rule_id: violation.id,
              logical_resource_ids: violation.logical_resource_ids
            }
          });
        }

        // Process warnings
        for (const warning of file.file_results?.warning || []) {
          results.push({
            rule_id: `cfn-nag-${warning.id}`,
            rule_name: `CFN-NAG: ${warning.message}`,
            passed: false,
            severity: 'medium',
            message: warning.message,
            source_location: {
              file: request.file_path,
              line: warning.line_numbers?.[0]
            },
            details: {
              rule_id: warning.id,
              logical_resource_ids: warning.logical_resource_ids
            }
          });
        }
      }

      return results;
    } catch (error) {
      return [{
        rule_id: 'cfn-nag-error',
        rule_name: 'CloudFormation NAG Error',
        passed: false,
        severity: 'medium',
        message: `Failed to run cfn_nag: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }];
    }
  }

  /**
   * Run Snyk security analysis
   */
  private async runSnyk(filePath: string, request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    try {
      const severityThreshold = this.config.snyk?.severity_threshold || 'medium';
      const command = `snyk test --json --severity-threshold=${severityThreshold} ${filePath}`;
      
      const { stdout, stderr } = await execAsync(command);
      
      const snykOutput = JSON.parse(stdout || '{}');
      const results: ValidationResult[] = [];

      if (snykOutput.vulnerabilities) {
        for (const vuln of snykOutput.vulnerabilities) {
          results.push({
            rule_id: `snyk-${vuln.id}`,
            rule_name: `Snyk: ${vuln.title}`,
            passed: false,
            severity: this.mapSnykSeverity(vuln.severity),
            message: vuln.description || vuln.title,
            details: {
              vulnerability_id: vuln.id,
              package_name: vuln.packageName,
              version: vuln.version,
              cve: vuln.identifiers?.CVE,
              cwe: vuln.identifiers?.CWE,
              cvss_score: vuln.cvssScore
            },
            suggested_fix: vuln.fixedIn ? `Upgrade to version ${vuln.fixedIn.join(', ')}` : undefined
          });
        }
      }

      return results;
    } catch (error) {
      return [{
        rule_id: 'snyk-error',
        rule_name: 'Snyk Security Analysis Error',
        passed: false,
        severity: 'medium',
        message: `Failed to run Snyk: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }];
    }
  }

  /**
   * Map ESLint severity to our severity levels
   */
  private mapESLintSeverity(severity: number): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 2: return 'high';
      case 1: return 'medium';
      default: return 'low';
    }
  }

  /**
   * Map CFN-Lint severity to our severity levels
   */
  private mapCfnLintSeverity(level: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (level?.toLowerCase()) {
      case 'error': return 'high';
      case 'warning': return 'medium';
      case 'info': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Map Snyk severity to our severity levels
   */
  private mapSnykSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }
}