#!/bin/bash

set -e

# Deploy Backend Script
# Usage: ./scripts/deploy-backend.sh [staging|production] [blue-green]

ENVIRONMENT=${1:-staging}
DEPLOYMENT_TYPE=${2:-standard}

echo "🚀 Deploying backend to $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❁EInvalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Set environment-specific variables
case $ENVIRONMENT in
    staging)
        AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID_STAGING}
        REGION=${AWS_REGION:-us-east-1}
        ;;
    production)
        AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID_PRODUCTION}
        REGION=${AWS_REGION:-us-east-1}
        ;;
esac

# Navigate to backend directory
cd backend

echo "📦 Installing dependencies..."
npm ci

echo "🔨 Building backend..."
npm run build

echo "🧪 Running tests..."
npm run test -- --watchAll=false

echo "🔍 Running security checks..."
npm audit --audit-level=high

# Package Lambda functions
echo "📦 Packaging Lambda functions..."
npm run package

# Deploy based on type
if [[ "$DEPLOYMENT_TYPE" == "blue-green" ]]; then
    echo "🔄 Deploying with blue-green strategy..."
    
    # Get current alias
    CURRENT_ALIAS=$(aws lambda get-alias --function-name ai-agent-api --name LIVE --query 'FunctionVersion' --output text 2>/dev/null || echo "1")
    
    # Deploy new version
    echo "📤 Deploying new Lambda version..."
    NEW_VERSION=$(aws lambda publish-version --function-name ai-agent-api --query 'Version' --output text)
    
    # Update STAGING alias to new version
    aws lambda update-alias --function-name ai-agent-api --name STAGING --function-version $NEW_VERSION
    
    # Health check on staging
    echo "🏥 Running health checks on staging version..."
    sleep 10
    
    HEALTH_CHECK_URL="https://api-staging.ai-agent.com/health"
    if curl -f -s $HEALTH_CHECK_URL > /dev/null; then
        echo "✁EHealth check passed"
        
        # Switch LIVE alias to new version
        aws lambda update-alias --function-name ai-agent-api --name LIVE --function-version $NEW_VERSION
        echo "✁ETraffic switched to new version: $NEW_VERSION"
        
        # Clean up old versions (keep last 3)
        echo "🧹 Cleaning up old versions..."
        aws lambda list-versions-by-function --function-name ai-agent-api --query 'Versions[:-3].Version' --output text | xargs -n1 -I {} aws lambda delete-function --function-name ai-agent-api:{}
    else
        echo "❁EHealth check failed. Rolling back..."
        aws lambda update-alias --function-name ai-agent-api --name STAGING --function-version $CURRENT_ALIAS
        exit 1
    fi
else
    echo "📤 Deploying with standard strategy..."
    
    # Deploy all Lambda functions
    for function in api-handler orchestrator kendra-search; do
        echo "Deploying $function..."
        aws lambda update-function-code \
            --function-name ai-agent-$function-$ENVIRONMENT \
            --zip-file fileb://dist/$function.zip
    done
    
    # Update Step Functions
    echo "🔄 Updating Step Functions..."
    aws stepfunctions update-state-machine \
        --state-machine-arn arn:aws:states:$REGION:$AWS_ACCOUNT_ID:stateMachine:ArtifactCheckWorkflow-$ENVIRONMENT \
        --definition file://dist/step-functions/artifact-check-workflow.json
fi

# Run database migrations
echo "🗄�E�ERunning database migrations..."
npm run migrate:$ENVIRONMENT

# Update API Gateway deployment
echo "🌐 Updating API Gateway..."
aws apigateway create-deployment \
    --rest-api-id $(aws apigateway get-rest-apis --query "items[?name=='ai-agent-api-$ENVIRONMENT'].id" --output text) \
    --stage-name $ENVIRONMENT

# Warm up Lambda functions
echo "🔥 Warming up Lambda functions..."
for function in api-handler orchestrator kendra-search; do
    aws lambda invoke --function-name ai-agent-$function-$ENVIRONMENT --payload '{"warmup": true}' /tmp/warmup-response.json
done

echo "✁EBackend deployment to $ENVIRONMENT completed successfully!"

# Output deployment information
echo "📊 Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "Deployment Type: $DEPLOYMENT_TYPE"
echo "Timestamp: $(date)"
echo "Lambda Functions Updated: api-handler, orchestrator, kendra-search"
echo "API Gateway: Updated"
echo "Database: Migrated"