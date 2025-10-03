#!/bin/bash

set -e

# Deploy Infrastructure Script
# Usage: ./scripts/deploy-infrastructure.sh [staging|production] [--diff-only]

ENVIRONMENT=${1:-staging}
DIFF_ONLY=${2}

echo "女・・ Deploying infrastructure to $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "笶・Invalid environment. Use 'staging' or 'production'"
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

echo "逃 Installing dependencies..."
npm ci

echo "ｧｪ Running infrastructure tests..."
npm run test

echo "剥 Running security checks..."
npm run security-check

# CDK Bootstrap check
echo "･ｾ Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION > /dev/null 2>&1; then
    echo "･ｾ Bootstrapping CDK..."
    npx cdk bootstrap aws://$AWS_ACCOUNT_ID/$REGION --context environment=$ENVIRONMENT
else
    echo "笨・CDK already bootstrapped"
fi

# Synthesize CloudFormation templates
echo "肌 Synthesizing CloudFormation templates..."
npx cdk synth --context environment=$ENVIRONMENT

# Run security scan on generated templates
echo "白 Running security scan on CloudFormation templates..."
if command -v checkov &> /dev/null; then
    checkov -d cdk.out --framework cloudformation --quiet
else
    echo "笞・・ Checkov not installed, skipping security scan"
fi

# Show diff
echo "搭 Showing infrastructure changes..."
npx cdk diff --context environment=$ENVIRONMENT

if [[ "$DIFF_ONLY" == "--diff-only" ]]; then
    echo "剥 Diff-only mode - exiting without deployment"
    exit 0
fi

# Confirmation for production
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "笞・・ You are about to deploy to PRODUCTION environment!"
    echo "搭 Please review the diff above carefully."
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "笶・Deployment cancelled"
        exit 1
    fi
fi

# Deploy infrastructure
echo "噫 Deploying infrastructure stacks..."

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
    echo "豆 Deploying $stack..."
    npx cdk deploy $stack \
        --require-approval never \
        --context environment=$ENVIRONMENT \
        --progress events \
        --rollback false
    
    # Verify stack deployment
    if aws cloudformation describe-stacks --stack-name $stack --region $REGION > /dev/null 2>&1; then
        STATUS=$(aws cloudformation describe-stacks --stack-name $stack --region $REGION --query 'Stacks[0].StackStatus' --output text)
        if [[ "$STATUS" == "CREATE_COMPLETE" || "$STATUS" == "UPDATE_COMPLETE" ]]; then
            echo "笨・$stack deployed successfully"
        else
            echo "笶・$stack deployment failed with status: $STATUS"
            exit 1
        fi
    else
        echo "笶・Failed to verify $stack deployment"
        exit 1
    fi
done

# Post-deployment validation
echo "剥 Running post-deployment validation..."

# Check VPC endpoints
echo "Validating VPC endpoints..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=AiAgent-VPC-$ENVIRONMENT" --query 'Vpcs[0].VpcId' --output text)
ENDPOINT_COUNT=$(aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" --query 'VpcEndpoints | length(@)')
echo "笨・Found $ENDPOINT_COUNT VPC endpoints"

# Check security groups
echo "Validating security groups..."
SG_COUNT=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=AiAgent-*-$ENVIRONMENT" --query 'SecurityGroups | length(@)')
echo "笨・Found $SG_COUNT security groups"

# Check Lambda functions
echo "Validating Lambda functions..."
LAMBDA_COUNT=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'ai-agent-') && contains(FunctionName, '$ENVIRONMENT')] | length(@)")
echo "笨・Found $LAMBDA_COUNT Lambda functions"

# Check DynamoDB tables
echo "Validating DynamoDB tables..."
DYNAMO_TABLES=$(aws dynamodb list-tables --query "TableNames[?contains(@, '$ENVIRONMENT')]" --output text | wc -w)
echo "笨・Found $DYNAMO_TABLES DynamoDB tables"

# Check RDS instance
echo "Validating RDS instance..."
RDS_STATUS=$(aws rds describe-db-instances --db-instance-identifier ai-agent-db-$ENVIRONMENT --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo "not-found")
if [[ "$RDS_STATUS" == "available" ]]; then
    echo "笨・RDS instance is available"
else
    echo "笞・・ RDS instance status: $RDS_STATUS"
fi

# Check S3 buckets
echo "Validating S3 buckets..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'ai-agent') && contains(Name, '$ENVIRONMENT')] | length(@)")
echo "笨・Found $S3_BUCKETS S3 buckets"

# Output stack information
echo "投 Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo "Stacks Deployed: ${#STACKS[@]}"
echo "Timestamp: $(date)"

# Output important endpoints and resources
echo "迫 Important Resources:"
npx cdk list --context environment=$ENVIRONMENT

echo "笨・Infrastructure deployment to $ENVIRONMENT completed successfully!"

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

echo "沈 Deployment metadata saved to deployment-info-$ENVIRONMENT.json"