#!/bin/bash

set -e

# Rollback Script
# Usage: ./scripts/rollback.sh [staging|production] [component] [version]

ENVIRONMENT=${1:-staging}
COMPONENT=${2:-all}
VERSION=${3}

echo "🔄 Initiating rollback for $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❁EInvalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Validate component
if [[ "$COMPONENT" != "all" && "$COMPONENT" != "frontend" && "$COMPONENT" != "backend" && "$COMPONENT" != "infrastructure" ]]; then
    echo "❁EInvalid component. Use 'all', 'frontend', 'backend', or 'infrastructure'"
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
    echo "⚠�E�E You are about to rollback PRODUCTION environment!"
    echo "Component: $COMPONENT"
    if [[ -n "$VERSION" ]]; then
        echo "Version: $VERSION"
    fi
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "❁ERollback cancelled"
        exit 1
    fi
fi

rollback_frontend() {
    echo "🔄 Rolling back frontend..."
    
    if [[ -z "$VERSION" ]]; then
        # Get latest backup
        LATEST_BACKUP=$(aws s3 ls s3://$BACKUP_BUCKET/ | sort | tail -n 1 | awk '{print $2}' | sed 's/\///')
        if [[ -z "$LATEST_BACKUP" ]]; then
            echo "❁ENo backup found for frontend rollback"
            return 1
        fi
        VERSION=$LATEST_BACKUP
    fi
    
    echo "📦 Restoring frontend from backup: $VERSION"
    
    # Create current backup before rollback
    ROLLBACK_BACKUP="rollback-$(date +%Y%m%d-%H%M%S)"
    aws s3 sync s3://$S3_BUCKET/ s3://$BACKUP_BUCKET/$ROLLBACK_BACKUP/
    
    # Restore from backup
    aws s3 sync s3://$BACKUP_BUCKET/$VERSION/ s3://$S3_BUCKET/ --delete
    
    # Invalidate CloudFront
    if [[ -n "$CLOUDFRONT_ID" ]]; then
        echo "🔄 Invalidating CloudFront cache..."
        aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
    fi
    
    echo "✁EFrontend rolled back to version: $VERSION"
}

rollback_backend() {
    echo "🔄 Rolling back backend..."
    
    cd backend
    
    if [[ -z "$VERSION" ]]; then
        # Get previous Lambda version
        CURRENT_VERSION=$(aws lambda get-alias --function-name ai-agent-api-$ENVIRONMENT --name LIVE --query 'FunctionVersion' --output text)
        PREVIOUS_VERSION=$((CURRENT_VERSION - 1))
        if [[ $PREVIOUS_VERSION -lt 1 ]]; then
            echo "❁ENo previous version found for backend rollback"
            return 1
        fi
        VERSION=$PREVIOUS_VERSION
    fi
    
    echo "📦 Rolling back Lambda functions to version: $VERSION"
    
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
        echo "🗄�E�ERolling back database migrations..."
        npm run migrate:rollback:$ENVIRONMENT
    fi
    
    echo "✁EBackend rolled back to version: $VERSION"
}

rollback_infrastructure() {
    echo "🔄 Rolling back infrastructure..."
    
    cd infrastructure
    
    if [[ -z "$VERSION" ]]; then
        echo "❁EInfrastructure rollback requires specific version/commit"
        return 1
    fi
    
    echo "📦 Rolling back infrastructure to version: $VERSION"
    
    # Checkout specific version
    git checkout $VERSION
    
    # Deploy previous version
    npx cdk deploy --all --require-approval never --context environment=$ENVIRONMENT
    
    # Return to main branch
    git checkout main
    
    echo "✁EInfrastructure rolled back to version: $VERSION"
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
        echo "⚠�E�E Infrastructure rollback skipped (requires manual intervention)"
        ;;
esac

# Health check after rollback
echo "🏥 Running health check..."
sleep 15

if [[ "$ENVIRONMENT" == "staging" ]]; then
    HEALTH_URL="https://staging.ai-agent.com/health"
else
    HEALTH_URL="https://ai-agent.com/health"
fi

if curl -f -s $HEALTH_URL > /dev/null; then
    echo "✁EHealth check passed after rollback"
else
    echo "❁EHealth check failed after rollback - manual intervention required"
    exit 1
fi

echo "✁ERollback completed successfully!"

# Log rollback event
echo "📝 Logging rollback event..."
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