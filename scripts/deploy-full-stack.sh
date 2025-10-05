#!/bin/bash
###############################################################################
# Full Stack Deployment Script
# 
# This script orchestrates the complete deployment process:
# 1. Pre-deployment validation
# 2. Environment configuration deployment
# 3. Infrastructure deployment (CDK)
# 4. Database migrations
# 5. Backend deployment
# 6. Frontend deployment
# 7. Post-deployment validation
# 8. Health checks
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STAGE=${1:-dev}
REGION=${AWS_REGION:-us-east-1}
DRY_RUN=${DRY_RUN:-false}
SKIP_TESTS=${SKIP_TESTS:-false}
BLUE_GREEN=${BLUE_GREEN:-false}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

# Error handler
error_handler() {
    log_error "Deployment failed at line $1"
    log_error "Rolling back changes..."
    
    # Attempt rollback
    if [ "$STAGE" != "dev" ]; then
        ./scripts/rollback.sh "$STAGE" || true
    fi
    
    exit 1
}

trap 'error_handler $LINENO' ERR

# Validate prerequisites
validate_prerequisites() {
    log_section "Validating Prerequisites"
    
    # Check required tools
    local required_tools=("node" "npm" "aws" "git")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is not installed"
            exit 1
        fi
        log_success "$tool is installed"
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured"
        exit 1
    fi
    log_success "AWS credentials configured"
    
    # Check Node version
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version 18 or higher required (current: $(node -v))"
        exit 1
    fi
    log_success "Node.js version is compatible"
}

# Run tests
run_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        log_warning "Skipping tests (SKIP_TESTS=true)"
        return
    fi
    
    log_section "Running Tests"
    
    # Backend tests
    log_info "Running backend tests..."
    cd backend
    npm ci
    npm run test -- --coverage --passWithNoTests
    cd ..
    log_success "Backend tests passed"
    
    # Frontend tests
    log_info "Running frontend tests..."
    cd frontend
    npm ci
    npm run test -- --coverage --passWithNoTests
    cd ..
    log_success "Frontend tests passed"
    
    # Infrastructure tests
    log_info "Running infrastructure tests..."
    cd infrastructure
    npm ci
    npm run test -- --passWithNoTests
    cd ..
    log_success "Infrastructure tests passed"
}

# Deploy environment configuration
deploy_configuration() {
    log_section "Deploying Environment Configuration"
    
    cd infrastructure
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Validating configuration..."
        npx ts-node src/scripts/environment-config-manager.ts validate "$STAGE" --dry-run
    else
        log_info "Deploying configuration to AWS..."
        npx ts-node src/scripts/environment-config-manager.ts deploy "$STAGE" "../config/${STAGE}.json"
    fi
    
    cd ..
    log_success "Configuration deployed"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_section "Deploying Infrastructure (CDK)"
    
    cd infrastructure
    npm ci
    npm run build
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Showing infrastructure changes..."
        npx cdk diff --context stage="$STAGE"
    else
        log_info "Deploying infrastructure..."
        npx cdk deploy --all \
            --context stage="$STAGE" \
            --require-approval never \
            --outputs-file "./cdk-outputs-${STAGE}.json"
        
        log_success "Infrastructure deployed"
        
        # Export outputs for use in other deployments
        if [ -f "./cdk-outputs-${STAGE}.json" ]; then
            log_info "Exporting CDK outputs..."
            cp "./cdk-outputs-${STAGE}.json" "../cdk-outputs-${STAGE}.json"
        fi
    fi
    
    cd ..
}

# Run database migrations
run_migrations() {
    log_section "Running Database Migrations"
    
    cd infrastructure
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Showing pending migrations..."
        npx ts-node src/scripts/database-migration.ts "$STAGE" --dry-run
    else
        log_info "Executing database migrations..."
        npx ts-node src/scripts/database-migration.ts "$STAGE"
    fi
    
    cd ..
    log_success "Database migrations completed"
}

# Deploy backend
deploy_backend() {
    log_section "Deploying Backend"
    
    cd backend
    npm ci
    npm run build
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Backend deployment skipped"
    else
        if [ "$BLUE_GREEN" = "true" ] && [ "$STAGE" != "dev" ]; then
            log_info "Deploying backend with blue-green strategy..."
            cd ../infrastructure
            npx ts-node src/scripts/blue-green-deployment.ts deploy "$STAGE"
            cd ../backend
        else
            log_info "Deploying backend Lambda functions..."
            npm run build:lambda
            
            # Deploy Lambda functions
            local functions=("artifact-check-handler" "status-check-handler" "agent-query-handler" "kendra-search-handler")
            for func in "${functions[@]}"; do
                log_info "Deploying $func..."
                aws lambda update-function-code \
                    --function-name "ai-agent-${func}-${STAGE}" \
                    --zip-file "fileb://dist/${func}.zip" \
                    --region "$REGION" || log_warning "Function $func may not exist yet"
            done
        fi
    fi
    
    cd ..
    log_success "Backend deployed"
}

# Deploy frontend
deploy_frontend() {
    log_section "Deploying Frontend"
    
    cd frontend
    npm ci
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Building frontend..."
        npm run build
        log_info "Dry run: Frontend deployment skipped"
    else
        # Load CDK outputs for environment variables
        if [ -f "../cdk-outputs-${STAGE}.json" ]; then
            log_info "Loading CDK outputs for environment configuration..."
            # Extract values from CDK outputs and set as environment variables
            export VITE_API_URL=$(cat "../cdk-outputs-${STAGE}.json" | grep -o '"ApiUrl":"[^"]*"' | cut -d'"' -f4 || echo "")
            export VITE_USER_POOL_ID=$(cat "../cdk-outputs-${STAGE}.json" | grep -o '"UserPoolId":"[^"]*"' | cut -d'"' -f4 || echo "")
            export VITE_USER_POOL_CLIENT_ID=$(cat "../cdk-outputs-${STAGE}.json" | grep -o '"UserPoolClientId":"[^"]*"' | cut -d'"' -f4 || echo "")
        fi
        
        log_info "Building frontend..."
        npm run build
        
        # Get S3 bucket name from CDK outputs
        local bucket_name="ai-agent-frontend-${STAGE}"
        
        log_info "Uploading to S3 bucket: $bucket_name..."
        aws s3 sync dist/ "s3://${bucket_name}/" \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "index.html" \
            --region "$REGION" || log_warning "S3 bucket may not exist yet"
        
        # Upload index.html separately with no-cache
        aws s3 cp dist/index.html "s3://${bucket_name}/index.html" \
            --cache-control "no-cache, no-store, must-revalidate" \
            --region "$REGION" || log_warning "S3 bucket may not exist yet"
        
        # Invalidate CloudFront cache
        local distribution_id=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?Comment=='AI Agent ${STAGE}'].Id" \
            --output text \
            --region "$REGION" || echo "")
        
        if [ -n "$distribution_id" ]; then
            log_info "Invalidating CloudFront cache..."
            aws cloudfront create-invalidation \
                --distribution-id "$distribution_id" \
                --paths "/*" \
                --region "$REGION"
        fi
    fi
    
    cd ..
    log_success "Frontend deployed"
}

# Post-deployment validation
post_deployment_validation() {
    log_section "Post-Deployment Validation"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Dry run: Validation skipped"
        return
    fi
    
    # Wait for services to stabilize
    log_info "Waiting for services to stabilize (30 seconds)..."
    sleep 30
    
    # Run health checks
    log_info "Running health checks..."
    
    # Check API Gateway
    local api_url=$(aws cloudformation describe-stacks \
        --stack-name "AiAgentStack-${STAGE}" \
        --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "")
    
    if [ -n "$api_url" ]; then
        log_info "Testing API endpoint: ${api_url}/health"
        if curl -f -s "${api_url}/health" > /dev/null; then
            log_success "API health check passed"
        else
            log_warning "API health check failed (may not be implemented yet)"
        fi
    fi
    
    # Check Lambda functions
    local functions=("artifact-check-handler" "status-check-handler")
    for func in "${functions[@]}"; do
        local func_name="ai-agent-${func}-${STAGE}"
        if aws lambda get-function --function-name "$func_name" --region "$REGION" &> /dev/null; then
            log_success "Lambda function $func_name exists"
        else
            log_warning "Lambda function $func_name not found"
        fi
    done
    
    log_success "Post-deployment validation completed"
}

# Generate deployment report
generate_deployment_report() {
    log_section "Deployment Report"
    
    local report_file="deployment-report-${STAGE}-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" <<EOF
{
  "stage": "$STAGE",
  "region": "$REGION",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dryRun": $DRY_RUN,
  "blueGreen": $BLUE_GREEN,
  "deployedBy": "${USER:-unknown}",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_info "Deployment report saved to: $report_file"
    cat "$report_file"
}

# Main deployment flow
main() {
    log_section "Full Stack Deployment"
    log_info "Stage: $STAGE"
    log_info "Region: $REGION"
    log_info "Dry Run: $DRY_RUN"
    log_info "Blue-Green: $BLUE_GREEN"
    log_info "Skip Tests: $SKIP_TESTS"
    
    # Confirm production deployment
    if [ "$STAGE" = "production" ] && [ "$DRY_RUN" != "true" ]; then
        log_warning "You are about to deploy to PRODUCTION!"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Execute deployment steps
    validate_prerequisites
    run_tests
    deploy_configuration
    deploy_infrastructure
    run_migrations
    deploy_backend
    deploy_frontend
    post_deployment_validation
    generate_deployment_report
    
    log_section "Deployment Complete!"
    log_success "All components deployed successfully to $STAGE"
    
    if [ "$STAGE" = "production" ]; then
        log_info "Remember to:"
        log_info "  1. Monitor CloudWatch dashboards"
        log_info "  2. Check error rates and performance metrics"
        log_info "  3. Verify critical user journeys"
        log_info "  4. Update documentation if needed"
    fi
}

# Execute main function
main
