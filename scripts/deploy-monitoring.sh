#!/bin/bash

# AI Agent System - Monitoring Deployment Script
# This script deploys the monitoring infrastructure and configures observability

set -e

# Configuration
STAGE=${1:-dev}
REGION=${AWS_REGION:-us-east-1}
ALERT_EMAIL=${ALERT_EMAIL:-""}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-""}

echo "🚀 Deploying AI Agent System Monitoring Infrastructure"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Alert Email: $ALERT_EMAIL"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check CDK
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK is not installed"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if logged into AWS
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "Not logged into AWS. Please run 'aws configure' or set AWS credentials"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Build the application
build_application() {
    print_status "Building application..."
    
    # Build backend
    cd backend
    npm install
    npm run build
    cd ..
    
    # Build frontend
    cd frontend
    npm install
    npm run build
    cd ..
    
    # Build infrastructure
    cd infrastructure
    npm install
    npm run build
    cd ..
    
    print_success "Application built successfully"
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying infrastructure..."
    
    cd infrastructure
    
    # Bootstrap CDK if needed
    cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$REGION
    
    # Deploy with monitoring parameters
    DEPLOY_COMMAND="cdk deploy --require-approval never"
    
    if [ ! -z "$ALERT_EMAIL" ]; then
        DEPLOY_COMMAND="$DEPLOY_COMMAND --parameters alertEmail=$ALERT_EMAIL"
    fi
    
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        DEPLOY_COMMAND="$DEPLOY_COMMAND --parameters slackWebhookUrl=$SLACK_WEBHOOK_URL"
    fi
    
    eval $DEPLOY_COMMAND
    
    cd ..
    
    print_success "Infrastructure deployed successfully"
}

# Configure CloudWatch Insights queries
configure_insights_queries() {
    print_status "Configuring CloudWatch Insights queries..."
    
    # Get log group names from CDK outputs
    STACK_NAME="AiAgentStack-$STAGE"
    
    # Create saved queries for common troubleshooting scenarios
    aws logs put-query-definition \
        --name "AI-Agent-Recent-Errors-$STAGE" \
        --query-string 'fields @timestamp, level, message, context.errorType, context.operation | filter level = "ERROR" | filter @timestamp > date_sub(now(), interval 1 hour) | sort @timestamp desc | limit 50' \
        --region $REGION || print_warning "Failed to create Recent Errors query"
    
    aws logs put-query-definition \
        --name "AI-Agent-Performance-Issues-$STAGE" \
        --query-string 'fields @timestamp, duration, context.operation, context.correlationId | filter ispresent(duration) and duration > 5000 | sort @timestamp desc | limit 100' \
        --region $REGION || print_warning "Failed to create Performance Issues query"
    
    aws logs put-query-definition \
        --name "AI-Agent-User-Activity-$STAGE" \
        --query-string 'fields @timestamp, context.userId, context.operation | filter ispresent(context.userId) | stats count() by context.userId | sort count desc | limit 20' \
        --region $REGION || print_warning "Failed to create User Activity query"
    
    aws logs put-query-definition \
        --name "AI-Agent-Error-Distribution-$STAGE" \
        --query-string 'fields @timestamp, level, context.errorType, context.functionName | filter level = "ERROR" | stats count() by context.errorType, context.functionName | sort count desc' \
        --region $REGION || print_warning "Failed to create Error Distribution query"
    
    print_success "CloudWatch Insights queries configured"
}

# Setup X-Ray service map
setup_xray() {
    print_status "Setting up X-Ray tracing..."
    
    # X-Ray is automatically configured through CDK
    # Just verify it's working
    aws xray get-service-graph --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s) --region $REGION > /dev/null || print_warning "X-Ray service graph not yet available"
    
    print_success "X-Ray tracing configured"
}

# Create monitoring dashboard URLs
create_dashboard_urls() {
    print_status "Creating monitoring dashboard URLs..."
    
    # Get stack outputs
    STACK_NAME="AiAgentStack-$STAGE"
    
    # CloudWatch Dashboard
    DASHBOARD_URL="https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=ai-agent-$STAGE"
    
    # X-Ray Service Map
    XRAY_URL="https://$REGION.console.aws.amazon.com/xray/home?region=$REGION#/service-map"
    
    # CloudWatch Logs Insights
    INSIGHTS_URL="https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:logs-insights"
    
    # Create a monitoring links file
    cat > monitoring-links.md << EOF
# AI Agent System Monitoring Links ($STAGE)

## Dashboards
- [CloudWatch Dashboard]($DASHBOARD_URL)
- [X-Ray Service Map]($XRAY_URL)
- [CloudWatch Logs Insights]($INSIGHTS_URL)

## Quick Access Queries
- Recent Errors: AI-Agent-Recent-Errors-$STAGE
- Performance Issues: AI-Agent-Performance-Issues-$STAGE
- User Activity: AI-Agent-User-Activity-$STAGE
- Error Distribution: AI-Agent-Error-Distribution-$STAGE

## Alarm Status
Check alarm status in CloudWatch console or use:
\`\`\`bash
aws cloudwatch describe-alarms --state-value ALARM --region $REGION
\`\`\`

## Log Groups
- /aws/lambda/ai-agent-artifact-check-$STAGE
- /aws/lambda/ai-agent-status-check-$STAGE
- /aws/lambda/ai-agent-agent-query-$STAGE
- /aws/lambda/ai-agent-kendra-search-$STAGE
- /aws/lambda/ai-agent-audit-$STAGE
- /ai-agent/$STAGE/application

## Troubleshooting
1. Check the CloudWatch Dashboard for overall system health
2. Use X-Ray Service Map to identify bottlenecks
3. Run CloudWatch Insights queries for detailed analysis
4. Check alarm history for recent issues
5. Review application logs for specific error details

Generated on: $(date)
EOF
    
    print_success "Monitoring links created in monitoring-links.md"
}

# Validate monitoring setup
validate_monitoring() {
    print_status "Validating monitoring setup..."
    
    # Check if alarms exist
    ALARM_COUNT=$(aws cloudwatch describe-alarms --region $REGION --query 'MetricAlarms[?starts_with(AlarmName, `ai-agent-'$STAGE'`)] | length(@)')
    
    if [ "$ALARM_COUNT" -gt 0 ]; then
        print_success "Found $ALARM_COUNT monitoring alarms"
    else
        print_warning "No monitoring alarms found"
    fi
    
    # Check if dashboard exists
    if aws cloudwatch get-dashboard --dashboard-name "ai-agent-$STAGE" --region $REGION &> /dev/null; then
        print_success "CloudWatch dashboard exists"
    else
        print_warning "CloudWatch dashboard not found"
    fi
    
    # Check X-Ray sampling rules
    SAMPLING_RULES=$(aws xray get-sampling-rules --region $REGION --query 'SamplingRuleRecords[?SamplingRule.RuleName==`ai-agent-'$STAGE'-sampling`] | length(@)')
    
    if [ "$SAMPLING_RULES" -gt 0 ]; then
        print_success "X-Ray sampling rules configured"
    else
        print_warning "X-Ray sampling rules not found"
    fi
    
    print_success "Monitoring validation completed"
}

# Test monitoring
test_monitoring() {
    print_status "Testing monitoring setup..."
    
    # Get API Gateway URL from stack outputs
    STACK_NAME="AiAgentStack-$STAGE"
    API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text 2>/dev/null || echo "")
    
    if [ ! -z "$API_URL" ]; then
        print_status "Testing API endpoint: $API_URL/health"
        
        # Make a test request to generate some metrics
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || echo "000")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            print_success "API health check passed"
        else
            print_warning "API health check returned status: $HTTP_STATUS"
        fi
    else
        print_warning "API Gateway URL not found in stack outputs"
    fi
    
    print_status "Wait 2-3 minutes for metrics to appear in CloudWatch"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up temporary files..."
    # Add any cleanup logic here
}

# Main execution
main() {
    print_status "Starting AI Agent System monitoring deployment"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Execute deployment steps
    check_prerequisites
    build_application
    deploy_infrastructure
    configure_insights_queries
    setup_xray
    create_dashboard_urls
    validate_monitoring
    test_monitoring
    
    print_success "🎉 Monitoring deployment completed successfully!"
    print_status "Check monitoring-links.md for dashboard URLs and quick access links"
    
    if [ ! -z "$ALERT_EMAIL" ]; then
        print_status "Alert notifications will be sent to: $ALERT_EMAIL"
    fi
    
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        print_status "Slack notifications configured"
    fi
    
    print_status "Next steps:"
    echo "1. Review the CloudWatch dashboard"
    echo "2. Test alert notifications"
    echo "3. Customize alarm thresholds as needed"
    echo "4. Set up additional monitoring for your specific use cases"
}

# Run main function
main "$@"