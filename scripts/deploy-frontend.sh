#!/bin/bash

set -e

# Deploy Frontend Script
# Usage: ./scripts/deploy-frontend.sh [staging|production]

ENVIRONMENT=${1:-staging}

echo "🚀 Deploying frontend to $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❁EInvalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Set environment-specific variables
case $ENVIRONMENT in
    staging)
        S3_BUCKET=${STAGING_S3_BUCKET}
        CLOUDFRONT_ID=${STAGING_CLOUDFRONT_ID}
        API_URL=${STAGING_API_URL}
        COGNITO_USER_POOL_ID=${STAGING_COGNITO_USER_POOL_ID}
        COGNITO_CLIENT_ID=${STAGING_COGNITO_CLIENT_ID}
        ;;
    production)
        S3_BUCKET=${PRODUCTION_S3_BUCKET}
        CLOUDFRONT_ID=${PRODUCTION_CLOUDFRONT_ID}
        API_URL=${PRODUCTION_API_URL}
        COGNITO_USER_POOL_ID=${PRODUCTION_COGNITO_USER_POOL_ID}
        COGNITO_CLIENT_ID=${PRODUCTION_COGNITO_CLIENT_ID}
        BACKUP_BUCKET=${PRODUCTION_S3_BACKUP_BUCKET}
        ;;
esac

# Navigate to frontend directory
cd frontend

echo "📦 Installing dependencies..."
npm ci

echo "🧪 Running tests..."
npm run test -- --watchAll=false

echo "🔍 Running linting..."
npm run lint

echo "🎨 Checking code formatting..."
npm run format:check

# Build for specific environment
echo "🔨 Building frontend for $ENVIRONMENT..."
export VITE_API_URL=$API_URL
export VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
export VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
export VITE_ENVIRONMENT=$ENVIRONMENT

npm run build

# Validate build output
echo "✁EValidating build output..."
if [ ! -d "dist" ]; then
    echo "❁EBuild failed - dist directory not found"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "❁EBuild failed - index.html not found"
    exit 1
fi

# Check bundle size
BUNDLE_SIZE=$(du -sh dist | cut -f1)
echo "📦 Bundle size: $BUNDLE_SIZE"

# Production-specific backup
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "💾 Creating backup of current production version..."
    BACKUP_PATH="$(date +%Y%m%d-%H%M%S)"
    aws s3 sync s3://$S3_BUCKET/ s3://$BACKUP_BUCKET/$BACKUP_PATH/ --delete
    echo "✁EBackup created at s3://$BACKUP_BUCKET/$BACKUP_PATH/"
fi

# Deploy to S3
echo "📤 Deploying to S3 bucket: $S3_BUCKET..."

# Set cache headers for different file types
aws s3 sync dist/ s3://$S3_BUCKET/ \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "*.html" \
    --exclude "service-worker.js" \
    --exclude "manifest.json"

# HTML files with no cache
aws s3 sync dist/ s3://$S3_BUCKET/ \
    --cache-control "no-cache, no-store, must-revalidate" \
    --include "*.html" \
    --include "service-worker.js" \
    --include "manifest.json"

echo "✁EFiles uploaded to S3"

# Invalidate CloudFront cache
if [[ -n "$CLOUDFRONT_ID" ]]; then
    echo "🔄 Invalidating CloudFront cache..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    
    echo "⏳ Waiting for CloudFront invalidation to complete..."
    aws cloudfront wait invalidation-completed \
        --distribution-id $CLOUDFRONT_ID \
        --id $INVALIDATION_ID
    
    echo "✁ECloudFront cache invalidated"
fi

# Health check
echo "🏥 Running health check..."
sleep 10

if [[ "$ENVIRONMENT" == "staging" ]]; then
    HEALTH_URL="https://staging.ai-agent.com/health"
else
    HEALTH_URL="https://ai-agent.com/health"
fi

if curl -f -s $HEALTH_URL > /dev/null; then
    echo "✁EHealth check passed"
else
    echo "⚠�E�E Health check failed, but deployment completed"
fi

# Security headers check
echo "🔒 Checking security headers..."
SECURITY_CHECK=$(curl -s -I $HEALTH_URL | grep -E "(X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security)" | wc -l)
if [[ $SECURITY_CHECK -ge 2 ]]; then
    echo "✁ESecurity headers present"
else
    echo "⚠�E�E Some security headers missing"
fi

echo "✁EFrontend deployment to $ENVIRONMENT completed successfully!"

# Output deployment information
echo "📊 Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "S3 Bucket: $S3_BUCKET"
echo "CloudFront Distribution: $CLOUDFRONT_ID"
echo "Bundle Size: $BUNDLE_SIZE"
echo "Timestamp: $(date)"

if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "Backup Location: s3://$BACKUP_BUCKET/$BACKUP_PATH/"
fi