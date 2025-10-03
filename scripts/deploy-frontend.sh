#!/bin/bash

set -e

# Deploy Frontend Script
# Usage: ./scripts/deploy-frontend.sh [staging|production]

ENVIRONMENT=${1:-staging}

echo "噫 Deploying frontend to $ENVIRONMENT environment..."

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "笶・Invalid environment. Use 'staging' or 'production'"
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

echo "逃 Installing dependencies..."
npm ci

echo "ｧｪ Running tests..."
npm run test -- --watchAll=false

echo "剥 Running linting..."
npm run lint

echo "耳 Checking code formatting..."
npm run format:check

# Build for specific environment
echo "畑 Building frontend for $ENVIRONMENT..."
export VITE_API_URL=$API_URL
export VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
export VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
export VITE_ENVIRONMENT=$ENVIRONMENT

npm run build

# Validate build output
echo "笨・Validating build output..."
if [ ! -d "dist" ]; then
    echo "笶・Build failed - dist directory not found"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "笶・Build failed - index.html not found"
    exit 1
fi

# Check bundle size
BUNDLE_SIZE=$(du -sh dist | cut -f1)
echo "逃 Bundle size: $BUNDLE_SIZE"

# Production-specific backup
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "沈 Creating backup of current production version..."
    BACKUP_PATH="$(date +%Y%m%d-%H%M%S)"
    aws s3 sync s3://$S3_BUCKET/ s3://$BACKUP_BUCKET/$BACKUP_PATH/ --delete
    echo "笨・Backup created at s3://$BACKUP_BUCKET/$BACKUP_PATH/"
fi

# Deploy to S3
echo "豆 Deploying to S3 bucket: $S3_BUCKET..."

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

echo "笨・Files uploaded to S3"

# Invalidate CloudFront cache
if [[ -n "$CLOUDFRONT_ID" ]]; then
    echo "売 Invalidating CloudFront cache..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    
    echo "竢ｳ Waiting for CloudFront invalidation to complete..."
    aws cloudfront wait invalidation-completed \
        --distribution-id $CLOUDFRONT_ID \
        --id $INVALIDATION_ID
    
    echo "笨・CloudFront cache invalidated"
fi

# Health check
echo "唱 Running health check..."
sleep 10

if [[ "$ENVIRONMENT" == "staging" ]]; then
    HEALTH_URL="https://staging.ai-agent.com/health"
else
    HEALTH_URL="https://ai-agent.com/health"
fi

if curl -f -s $HEALTH_URL > /dev/null; then
    echo "笨・Health check passed"
else
    echo "笞・・ Health check failed, but deployment completed"
fi

# Security headers check
echo "白 Checking security headers..."
SECURITY_CHECK=$(curl -s -I $HEALTH_URL | grep -E "(X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security)" | wc -l)
if [[ $SECURITY_CHECK -ge 2 ]]; then
    echo "笨・Security headers present"
else
    echo "笞・・ Some security headers missing"
fi

echo "笨・Frontend deployment to $ENVIRONMENT completed successfully!"

# Output deployment information
echo "投 Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "S3 Bucket: $S3_BUCKET"
echo "CloudFront Distribution: $CLOUDFRONT_ID"
echo "Bundle Size: $BUNDLE_SIZE"
echo "Timestamp: $(date)"

if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "Backup Location: s3://$BACKUP_BUCKET/$BACKUP_PATH/"
fi