# Rules Engine Integration with Step Functions Workflow

## Overview

This document summarizes the implementation of task 16: "Integrate rules engine with Step Functions workflow". The integration connects the rules engine service with the fetch-artifact and compose-report handlers, implements artifact type detection and rule selection logic, adds validation result processing and scoring integration, and creates comprehensive error handling for validation failures and timeouts.

## Implementation Details

### 1. Enhanced Fetch Artifact Handler

**File**: `src/lambda/handlers/fetch-artifact-handler.ts`

**Key Enhancements**:
- Added artifact type detection logic that analyzes content patterns to identify the actual artifact type
- Integrated with RulesEngineService to get applicable rules for the detected artifact type
- Added rules engine capabilities detection to determine what types of analysis are supported
- Implemented dynamic validation configuration based on artifact type and rule complexity
- Enhanced error handling and logging for rules engine integration

**New Functions**:
- `detectArtifactType()`: Analyzes content to determine actual artifact type (CloudFormation, Terraform, TypeScript, etc.)
- `getApplicableRules()`: Filters enabled rules based on artifact type compatibility
- `getRulesEngineCapabilities()`: Retrieves validation capabilities for the artifact type
- `getValidationConfig()`: Configures timeouts and retry settings based on artifact complexity

### 2. New Rules Engine Validation Handler

**File**: `src/lambda/handlers/rules-engine-validation-handler.ts`

**Purpose**: Dedicated Lambda handler for running rules engine validation as a separate step in the workflow.

**Key Features**:
- Comprehensive retry logic with exponential backoff
- Configurable timeouts based on artifact type and rule complexity
- Artifact size validation (max 50MB)
- Non-retryable error detection (invalid types, configuration errors)
- Detailed execution status reporting (completed, failed, timeout, skipped)
- Health check endpoint for monitoring

**Return Values**:
- `validationReport`: Complete ValidationReport from rules engine
- `executionStatus`: Status of the validation execution
- `executionTime`: Time taken for validation
- `errorDetails`: Error information if validation failed

### 3. Enhanced Compose Report Handler

**File**: `src/lambda/handlers/compose-report-handler.ts`

**Key Enhancements**:
- Integrated with rules engine validation results from the workflow
- Enhanced error handling for different validation statuses (timeout, failed, skipped)
- Improved compliance scoring using rules engine scores when available
- Enhanced summary generation with validation execution context
- Better recommendation generation based on rules engine findings
- Fallback validation execution if no results provided

**New Features**:
- Support for validation summary from parallel execution
- Rules engine specific issue parsing and categorization
- Timeout and failure status handling in reports
- Enhanced recommendations based on rule violations

### 4. Updated Step Functions Workflow

**File**: `infrastructure/src/constructs/step-functions.ts`

**Key Changes**:
- Added dedicated Rules Engine Validation Lambda step
- Implemented parallel execution of validation tasks (Rules Engine, Static, Semantic)
- Added ProcessParallelResults step to restructure data from parallel execution
- Enhanced error handling and retry logic for all validation steps
- Increased timeout and memory allocation for rules engine processing

**New Workflow Structure**:
```
1. ReceiveRequest
2. KendraQuery
3. FetchArtifact (enhanced with rules engine integration)
4. ParallelValidation:
   - RulesEngineValidation (new)
   - StaticChecks
   - SemanticCheck
5. ProcessParallelResults (new)
6. ComposeReport (enhanced)
7. NotifyResults
```

### 5. Artifact Type Detection

**Supported Types**:
- **CloudFormation**: JSON/YAML with AWSTemplateFormatVersion or Resources
- **Terraform**: HCL with resource/provider/terraform blocks
- **Kubernetes**: YAML with apiVersion and kind
- **Dockerfile**: Files with FROM, RUN, COPY commands
- **TypeScript**: Code with TypeScript-specific syntax
- **JavaScript**: Code with JavaScript patterns
- **Python**: Code with Python syntax patterns
- **Java**: Code with Java class definitions
- **JSON/YAML**: Generic structured data formats

### 6. Validation Configuration

**Dynamic Configuration Based On**:
- **Artifact Type**: Infrastructure code gets longer timeouts
- **Rule Count**: More rules = longer timeout and parallel processing
- **Rule Severity**: Critical rules get more retries
- **Rule Types**: Semantic rules get additional timeout

**Configuration Parameters**:
- `timeoutMs`: 60s-300s based on complexity
- `maxRetries`: 2-3 based on rule criticality
- `enableParallelValidation`: Based on rule count

### 7. Error Handling

**Comprehensive Error Handling For**:
- Validation timeouts with configurable limits
- Transient failures with exponential backoff retry
- Non-retryable errors (invalid types, size limits)
- Rules engine service failures
- Network and AWS service errors

**Error Categories**:
- **Retryable**: Network errors, temporary service issues
- **Non-retryable**: Invalid artifact types, size limits, configuration errors
- **Timeout**: Validation exceeds configured time limit

### 8. Integration Testing

**File**: `src/test-rules-engine-integration.ts`

**Test Coverage**:
- End-to-end workflow simulation
- Artifact type detection accuracy
- Rules engine validation execution
- Error handling scenarios
- Report composition with rules engine results
- Parallel validation workflow

## Configuration

### Environment Variables

**Rules Engine Configuration**:
```bash
RULE_DEFINITIONS_TABLE_NAME=ai-agent-rule-definitions-{stage}
SEVERITY_WEIGHT_CRITICAL=100
SEVERITY_WEIGHT_HIGH=50
SEVERITY_WEIGHT_MEDIUM=20
SEVERITY_WEIGHT_LOW=5
```

**Static Analysis Tools**:
```bash
ESLINT_ENABLED=true
CFN_LINT_ENABLED=true
CFN_NAG_ENABLED=true
SNYK_ENABLED=true
```

**LLM Configuration**:
```bash
LLM_MODEL_NAME=anthropic.claude-3-sonnet-20240229-v1:0
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4096
LLM_CONFIDENCE_THRESHOLD=0.7
```

### Lambda Function Configuration

**Rules Engine Validation Lambda**:
- **Timeout**: 10 minutes (for complex rule processing)
- **Memory**: 2048 MB (for rule engine operations)
- **Runtime**: Node.js 18.x
- **VPC**: Private subnets with VPC endpoints

## Benefits

### 1. Improved Accuracy
- Automatic artifact type detection reduces misclassification
- Applicable rule filtering ensures relevant validation
- Dynamic configuration optimizes performance

### 2. Better Performance
- Parallel execution of validation tasks
- Configurable timeouts prevent hanging workflows
- Retry logic handles transient failures

### 3. Enhanced Reliability
- Comprehensive error handling and recovery
- Graceful degradation when rules engine unavailable
- Detailed status reporting for monitoring

### 4. Better User Experience
- Clear validation status in reports
- Specific recommendations based on rule violations
- Source attribution for validation findings

## Monitoring and Observability

### CloudWatch Metrics
- Validation execution times
- Success/failure rates by artifact type
- Rules engine performance metrics
- Error rates and types

### Logging
- Structured JSON logging with correlation IDs
- Detailed validation execution logs
- Error context and stack traces
- Performance timing information

### Alarms
- Failed validation executions
- Validation timeout alerts
- Rules engine service health
- Performance degradation alerts

## Future Enhancements

### 1. Rule Caching
- Cache frequently used rules to improve performance
- Implement rule dependency resolution
- Add rule versioning and rollback capabilities

### 2. Advanced Analytics
- Validation trend analysis
- Rule effectiveness metrics
- Artifact quality scoring over time

### 3. Integration Improvements
- Support for additional artifact types
- Enhanced semantic analysis capabilities
- Integration with external security scanning tools

## Requirements Satisfied

This implementation satisfies the following requirements from the task:

✅ **4.1**: Artifact validation with static and semantic checks using rules engine
✅ **4.2**: Orchestrated validation workflow with proper error handling
✅ **4.3**: Comprehensive reporting with scores and recommendations

The integration provides a robust, scalable, and maintainable solution for artifact validation using the rules engine within the Step Functions workflow.