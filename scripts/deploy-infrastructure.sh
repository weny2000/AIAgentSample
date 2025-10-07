#!/bin/bash

set -e

# Deploy Infrastructure Script
# Usage: ./scripts/deploy-infrastructure.sh [staging|production] [--diff-only]

ENVIRONMENT=${1:-staging}
DIFF_ONLY=${2}

echo "🏗�E�E Deploying infrastructure to $ENVIRONMENT environment..."

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

# Navigate to infrastructure directory
cd infrastructure

echo "📦 Installing dependencies..."
npm ci

echo "🧪 Running infrastructure tests..."
npm run test

echo "🏷️  Running tag validation..."
npm run validate-tags

echo "🔍 Running security checks..."
npm run security-check

# CDK Bootstrap check
echo "🥾 Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION > /dev/null 2>&1; then
    echo "🥾 Bootstrapping CDK..."
    npx cdk bootstrap aws://$AWS_ACCOUNT_ID/$REGION --context environment=$ENVIRONMENT
else
    echo "✁ECDK already bootstrapped"
fi

# Synthesize CloudFormation templates
echo "🔧 Synthesizing CloudFormation templates..."
npx cdk synth --context environment=$ENVIRONMENT

# Run security scan on generated templates
echo "🔒 Running security scan on CloudFormation templates..."
if command -v checkov &> /dev/null; then
    checkov -d cdk.out --framework cloudformation --quiet
else
    echo "⚠�E�E Checkov not installed, skipping security scan"
fi

# Show diff
echo "📋 Showing infrastructure changes..."
npx cdk diff --context environment=$ENVIRONMENT

if [[ "$DIFF_ONLY" == "--diff-only" ]]; then
    echo "🔍 Diff-only mode - exiting without deployment"
    exit 0
fi

# Confirmation for production
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "⚠�E�E You are about to deploy to PRODUCTION environment!"
    echo "📋 Please review the diff above carefully."
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "❁EDeployment cancelled"
        exit 1
    fi
fi

# Deploy infrastructure
echo "🚀 Deploying infrastructure stacks..."

# Deploy in order of dependencies
STACKS=(
    "AiAgentNetworkStack-$ENVIRONMENT"
    "AiAgentSecurityStack-$ENVIRONMENT"
    "AiAgentDataStack-$ENVIRONMENT"
    "AiAgentComputeStack-$ENVIRONMENT"
    "AiAgentApiStack-$ENVIRONMENT"
    "AiAgentMonitoringStack-$ENVIRONMENT"
)

for stack in "${STACKS[@]}"; do
    echo "📤 Deploying $stack..."
    npx cdk deploy $stack \
        --require-approval never \
        --context environment=$ENVIRONMENT \
        --progress events \
        --rollback false
    
    # Verify stack deployment
    if aws cloudformation describe-stacks --stack-name $stack --region $REGION > /dev/null 2>&1; then
        STATUS=$(aws cloudformation describe-stacks --stack-name $stack --region $REGION --query 'Stacks[0].StackStatus' --output text)
        if [[ "$STATUS" == "CREATE_COMPLETE" || "$STATUS" == "UPDATE_COMPLETE" ]]; then
            echo "✁E$stack deployed successfully"
        else
            echo "❁E$stack deployment failed with status: $STATUS"
            exit 1
        fi
    else
        echo "❁EFailed to verify $stack deployment"
        exit 1
    fi
done

# Generate tag documentation
echo "📚 Generating tag documentation..."
npm run docs:generate

# Post-deployment validation
echo "🔍 Running post-deployment validation..."

# Check VPC endpoints
echo "Validating VPC endpoints..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=AiAgent-VPC-$ENVIRONMENT" --query 'Vpcs[0].VpcId' --output text)
ENDPOINT_COUNT=$(aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" --query 'VpcEndpoints | length(@)')
echo "✁EFound $ENDPOINT_COUNT VPC endpoints"

# Check security groups
echo "Validating security groups..."
SG_COUNT=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=AiAgent-*-$ENVIRONMENT" --query 'SecurityGroups | length(@)')
echo "✁EFound $SG_COUNT security groups"

# Check Lambda functions
echo "Validating Lambda functions..."
LAMBDA_COUNT=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'ai-agent-') && contains(FunctionName, '$ENVIRONMENT')] | length(@)")
echo "✁EFound $LAMBDA_COUNT Lambda functions"

# Check DynamoDB tables
echo "Validating DynamoDB tables..."
DYNAMO_TABLES=$(aws dynamodb list-tables --query "TableNames[?contains(@, '$ENVIRONMENT')]" --output text | wc -w)
echo "✁EFound $DYNAMO_TABLES DynamoDB tables"

# Check RDS instance
echo "Validating RDS instance..."
RDS_STATUS=$(aws rds describe-db-instances --db-instance-identifier ai-agent-db-$ENVIRONMENT --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo "not-found")
if [[ "$RDS_STATUS" == "available" ]]; then
    echo "✁ERDS instance is available"
else
    echo "⚠�E�E RDS instance status: $RDS_STATUS"
fi

# Check S3 buckets
echo "Validating S3 buckets..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'ai-agent') && contains(Name, '$ENVIRONMENT')] | length(@)")
echo "✁EFound $S3_BUCKETS S3 buckets"

# Validate resource tags
echo "Validating resource tags..."
TAG_VALIDATION_RESULT=$(npm run validate-tags 2>&1 || echo "FAILED")
if [[ "$TAG_VALIDATION_RESULT" == *"FAILED"* ]]; then
    echo "⚠️ Tag validation warnings found - check logs"
else
    echo "✅Resource tags validated successfully"
fi

# Output stack information
echo "📊 Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo "Stacks Deployed: ${#STACKS[@]}"
echo "Timestamp: $(date)"

# Output important endpoints and resources
echo "🔗 Important Resources:"
npx cdk list --context environment=$ENVIRONMENT

echo "✁EInfrastructure deployment to $ENVIRONMENT completed successfully!"

# Save deployment metadata
cat > deployment-info-$ENVIRONMENT.json << EOF
{
  "environment": "$ENVIRONMENT",
  "region": "$REGION",
  "accountId": "$AWS_ACCOUNT_ID",
  "deploymentTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "stacksDeployed": $(printf '%s\n' "${STACKS[@]}" | jq -R . | jq -s .),
  "vpcId": "$VPC_ID",
  "lambdaFunctions": $LAMBDA_COUNT,
  "dynamoTables": $DYNAMO_TABLES,
  "s3Buckets": $S3_BUCKETS
}
EOF

echo "💾 Deployment metadata saved to deployment-info-$ENVIRONMENT.json"