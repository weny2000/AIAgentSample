#!/bin/bash

set -e

# Rollback Script
# Usage: ./scripts/rollback.sh [staging|production] [component] [version]

ENVIRONMENT=${1:-staging}
COMPONENT=${2:-all}
VERSION=${3}

echo "売 Initiating rollback for $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "笶・Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Validate component
if [[ "$COMPONENT" != "all" && "$COMPONENT" != "frontend" && "$COMPONENT" != "backend" && "$COMPONENT" != "infrastructure" ]]; then
    echo "笶・Invalid component. Use 'all', 'frontend', 'backend', or 'infrastructure'"
    exit 1
fi

# Set environment-specific variables
case $ENVIRONMENT in
    staging)
        S3_BUCKET=${STAGING_S3_BUCKET}
        CLOUDFRONT_ID=${STAGING_CLOUDFRONT_ID}
        BACKUP_BUCKET=${STAGING_S3_BACKUP_BUCKET}
        ;;
    production)
        S3_BUCKET=${PRODUCTION_S3_BUCKET}
        CLOUDFRONT_ID=${PRODUCTION_CLOUDFRONT_ID}
        BACKUP_BUCKET=${PRODUCTION_S3_BACKUP_BUCKET}
        ;;
esac

# Confirmation for production rollback
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "笞・・ You are about to rollback PRODUCTION environment!"
    echo "Component: $COMPONENT"
    if [[ -n "$VERSION" ]]; then
        echo "Version: $VERSION"
    fi
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "笶・Rollback cancelled"
        exit 1
    fi
fi

rollback_frontend() {
    echo "売 Rolling back frontend..."
    
    if [[ -z "$VERSION" ]]; then
        # Get latest backup
        LATEST_BACKUP=$(aws s3 ls s3://$BACKUP_BUCKET/ | sort | tail -n 1 | awk '{print $2}' | sed 's/\///')
        if [[ -z "$LATEST_BACKUP" ]]; then
            echo "笶・No backup found for frontend rollback"
            return 1
        fi
        VERSION=$LATEST_BACKUP
    fi
    
    echo "逃 Restoring frontend from backup: $VERSION"
    
    # Create current backup before rollback
    ROLLBACK_BACKUP="rollback-$(date +%Y%m%d-%H%M%S)"
    aws s3 sync s3://$S3_BUCKET/ s3://$BACKUP_BUCKET/$ROLLBACK_BACKUP/
    
    # Restore from backup
    aws s3 sync s3://$BACKUP_BUCKET/$VERSION/ s3://$S3_BUCKET/ --delete
    
    # Invalidate CloudFront
    if [[ -n "$CLOUDFRONT_ID" ]]; then
        echo "売 Invalidating CloudFront cache..."
        aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
    fi
    
    echo "笨・Frontend rolled back to version: $VERSION"
}

rollback_backend() {
    echo "売 Rolling back backend..."
    
    cd backend
    
    if [[ -z "$VERSION" ]]; then
        # Get previous Lambda version
        CURRENT_VERSION=$(aws lambda get-alias --function-name ai-agent-api-$ENVIRONMENT --name LIVE --query 'FunctionVersion' --output text)
        PREVIOUS_VERSION=$((CURRENT_VERSION - 1))
        if [[ $PREVIOUS_VERSION -lt 1 ]]; then
            echo "笶・No previous version found for backend rollback"
            return 1
        fi
        VERSION=$PREVIOUS_VERSION
    fi
    
    echo "逃 Rolling back Lambda functions to version: $VERSION"
    
    # Rollback Lambda functions
    for function in api-handler orchestrator kendra-search; do
        echo "Rolling back $function..."
        aws lambda update-alias \
            --function-name ai-agent-$function-$ENVIRONMENT \
            --name LIVE \
            --function-version $VERSION
    done
    
    # Rollback database if needed
    if [[ -n "$DATABASE_ROLLBACK" ]]; then
        echo "淀・・Rolling back database migrations..."
        npm run migrate:rollback:$ENVIRONMENT
    fi
    
    echo "笨・Backend rolled back to version: $VERSION"
}

rollback_infrastructure() {
    echo "売 Rolling back infrastructure..."
    
    cd infrastructure
    
    if [[ -z "$VERSION" ]]; then
        echo "笶・Infrastructure rollback requires specific version/commit"
        return 1
    fi
    
    echo "逃 Rolling back infrastructure to version: $VERSION"
    
    # Checkout specific version
    git checkout $VERSION
    
    # Deploy previous version
    npx cdk deploy --all --require-approval never --context environment=$ENVIRONMENT
    
    # Return to main branch
    git checkout main
    
    echo "笨・Infrastructure rolled back to version: $VERSION"
}

# Execute rollback based on component
case $COMPONENT in
    frontend)
        rollback_frontend
        ;;
    backend)
        rollback_backend
        ;;
    infrastructure)
        rollback_infrastructure
        ;;
    all)
        rollback_frontend
        rollback_backend
        echo "笞・・ Infrastructure rollback skipped (requires manual intervention)"
        ;;
esac

# Health check after rollback
echo "唱 Running health check..."
sleep 15

if [[ "$ENVIRONMENT" == "staging" ]]; then
    HEALTH_URL="https://staging.ai-agent.com/health"
else
    HEALTH_URL="https://ai-agent.com/health"
fi

if curl -f -s $HEALTH_URL > /dev/null; then
    echo "笨・Health check passed after rollback"
else
    echo "笶・Health check failed after rollback - manual intervention required"
    exit 1
fi

echo "笨・Rollback completed successfully!"

# Log rollback event
echo "統 Logging rollback event..."
cat > rollback-log-$(date +%Y%m%d-%H%M%S).json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "component": "$COMPONENT",
  "version": "$VERSION",
  "status": "completed",
  "healthCheck": "passed"
}
EOF