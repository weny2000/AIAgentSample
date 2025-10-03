import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ValidationResult, SemanticAnalysisConfig, ArtifactValidationRequest } from './types';

export class SemanticAnalysisEngine {
  private config: SemanticAnalysisConfig;
  private bedrockClient: BedrockRuntimeClient;

  constructor(config: SemanticAnalysisConfig) {
    this.config = config;
    this.bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  /**
   * Run semantic analysis using LLM
   */
  async runAnalysis(request: ArtifactValidationRequest): Promise<ValidationResult[]> {
    try {
      const prompt = this.buildPrompt(request);
      const response = await this.invokeLLM(prompt);
      return this.parseResponse(response, request);
    } catch (error) {
      console.error('Semantic analysis failed:', error);
      return [{
        rule_id: 'semantic-analysis-error',
        rule_name: 'Semantic Analysis Error',
        passed: false,
        severity: 'medium',
        message: `Failed to run semantic analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }];
    }
  }

  /**
   * Build the prompt for LLM analysis
   */
  private buildPrompt(request: ArtifactValidationRequest): string {
    const basePrompt = this.config.prompt_template || this.getDefaultPromptTemplate();
    
    return basePrompt
      .replace('{artifact_type}', request.artifact_type)
      .replace('{content}', request.content)
      .replace('{file_path}', request.file_path || 'unknown')
      .replace('{metadata}', JSON.stringify(request.metadata || {}, null, 2));
  }

  /**
   * Get default prompt template for semantic analysis
   */
  private getDefaultPromptTemplate(): string {
    return `You are a senior software architect and security expert. Analyze the following {artifact_type} artifact for semantic issues, best practices, and potential problems.

Artifact Type: {artifact_type}
File Path: {file_path}
Metadata: {metadata}

Content:
{content}

Please analyze this artifact and identify any issues in the following categories:
1. Architecture and Design Issues
2. Security Vulnerabilities
3. Performance Concerns
4. Maintainability Problems
5. Best Practice Violations
6. Business Logic Errors
7. Integration Issues

For each issue found, provide:
- A unique rule_id (use format: semantic-[category]-[number])
- A descriptive rule_name
- Severity level (critical, high, medium, low)
- Clear description of the issue
- Specific location if applicable (line numbers)
- Suggested fix or improvement

Respond in JSON format with an array of issues:
{
  "issues": [
    {
      "rule_id": "semantic-security-001",
      "rule_name": "Hardcoded Credentials",
      "severity": "critical",
      "message": "Hardcoded API key found in configuration",
      "line": 15,
      "suggested_fix": "Move API key to environment variable or secure secret store",
      "confidence": 0.95
    }
  ]
}

If no issues are found, return: {"issues": []}`;
  }

  /**
   * Invoke the LLM based on the configured provider
   */
  private async invokeLLM(prompt: string): Promise<string> {
    switch (this.config.llm_provider) {
      case 'bedrock':
        return this.invokeBedrockModel(prompt);
      case 'openai':
        return this.invokeOpenAI(prompt);
      case 'custom':
        return this.invokeCustomModel(prompt);
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.llm_provider}`);
    }
  }

  /**
   * Invoke AWS Bedrock model
   */
  private async invokeBedrockModel(prompt: string): Promise<string> {
    const modelId = this.config.model_name;
    
    // Prepare the request based on model type
    let requestBody: any;
    
    if (modelId.includes('claude')) {
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: this.config.max_tokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      };
    } else if (modelId.includes('titan')) {
      requestBody = {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: this.config.max_tokens,
          temperature: this.config.temperature,
          topP: 0.9
        }
      };
    } else {
      throw new Error(`Unsupported Bedrock model: ${modelId}`);
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (modelId.includes('claude')) {
      return responseBody.content[0].text;
    } else if (modelId.includes('titan')) {
      return responseBody.results[0].outputText;
    }

    throw new Error('Failed to parse Bedrock response');
  }

  /**
   * Invoke OpenAI model (placeholder - would need OpenAI SDK)
   */
  private async invokeOpenAI(prompt: string): Promise<string> {
    // This would require the OpenAI SDK
    throw new Error('OpenAI integration not implemented yet');
  }

  /**
   * Invoke custom model endpoint
   */
  private async invokeCustomModel(prompt: string): Promise<string> {
    // This would make HTTP requests to a custom model endpoint
    throw new Error('Custom model integration not implemented yet');
  }

  /**
   * Parse the LLM response into ValidationResult objects
   */
  private parseResponse(response: string, request: ArtifactValidationRequest): ValidationResult[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const issues = parsed.issues || [];
      
      return issues
        .filter((issue: any) => issue.confidence >= this.config.confidence_threshold)
        .map((issue: any) => ({
          rule_id: issue.rule_id || 'semantic-unknown',
          rule_name: issue.rule_name || 'Unknown Semantic Issue',
          passed: false, // All identified issues are failures
          severity: this.validateSeverity(issue.severity),
          message: issue.message || 'No description provided',
          source_location: issue.line ? {
            file: request.file_path,
            line: issue.line,
            column: issue.column
          } : undefined,
          suggested_fix: issue.suggested_fix,
          details: {
            confidence: issue.confidence,
            category: issue.category,
            llm_provider: this.config.llm_provider,
            model_name: this.config.model_name
          }
        }));
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return [{
        rule_id: 'semantic-parse-error',
        rule_name: 'Semantic Analysis Parse Error',
        passed: false,
        severity: 'low',
        message: 'Failed to parse semantic analysis results',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          raw_response: response.substring(0, 500) // First 500 chars for debugging
        }
      }];
    }
  }

  /**
   * Validate and normalize severity levels
   */
  private validateSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const normalizedSeverity = severity?.toLowerCase();
    
    if (validSeverities.includes(normalizedSeverity)) {
      return normalizedSeverity as 'low' | 'medium' | 'high' | 'critical';
    }
    
    return 'medium'; // Default fallback
  }

  /**
   * Get analysis capabilities based on artifact type
   */
  static getAnalysisCapabilities(artifactType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      'typescript': [
        'Type safety analysis',
        'Design pattern validation',
        'Performance optimization suggestions',
        'Security vulnerability detection',
        'Code maintainability assessment'
      ],
      'cloudformation': [
        'Resource configuration validation',
        'Security best practices',
        'Cost optimization opportunities',
        'Compliance checking',
        'Architecture review'
      ],
      'dockerfile': [
        'Security vulnerability scanning',
        'Image optimization suggestions',
        'Best practice validation',
        'Multi-stage build analysis'
      ],
      'terraform': [
        'Infrastructure security analysis',
        'Resource optimization',
        'State management validation',
        'Provider best practices'
      ]
    };

    return capabilityMap[artifactType.toLowerCase()] || [
      'General code quality analysis',
      'Security vulnerability detection',
      'Best practice validation'
    ];
  }
}