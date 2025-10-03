#!/bin/bash

set -e

echo "🔍 Validating CI/CD deployment setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation functions
validate_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅ $1 exists${NC}"
        return 0
    else
        echo -e "${RED}❌ $1 missing${NC}"
        return 1
    fi
}

validate_directory() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✅ $1 directory exists${NC}"
        return 0
    else
        echo -e "${RED}❌ $1 directory missing${NC}"
        return 1
    fi
}

validate_script_executable() {
    if [ -x "$1" ]; then
        echo -e "${GREEN}✅ $1 is executable${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $1 is not executable (will be fixed in CI)${NC}"
        return 0
    fi
}

validate_json() {
    if command -v jq >/dev/null 2>&1; then
        if jq empty "$1" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $1 is valid JSON${NC}"
            return 0
        else
            echo -e "${RED}❌ $1 is invalid JSON${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  jq not available, skipping JSON validation for $1${NC}"
        return 0
    fi
}

# Start validation
echo "📋 Checking GitHub Actions workflows..."
WORKFLOWS_VALID=true

validate_file ".github/workflows/ci.yml" || WORKFLOWS_VALID=false
validate_file ".github/workflows/deploy-staging.yml" || WORKFLOWS_VALID=false
validate_file ".github/workflows/deploy-production.yml" || WORKFLOWS_VALID=false
validate_file ".github/workflows/security-scan.yml" || WORKFLOWS_VALID=false

echo ""
echo "📋 Checking deployment scripts..."
SCRIPTS_VALID=true

validate_file "scripts/deploy-infrastructure.sh" || SCRIPTS_VALID=false
validate_file "scripts/deploy-backend.sh" || SCRIPTS_VALID=false
validate_file "scripts/deploy-frontend.sh" || SCRIPTS_VALID=false
validate_file "scripts/rollback.sh" || SCRIPTS_VALID=false

validate_script_executable "scripts/deploy-infrastructure.sh"
validate_script_executable "scripts/deploy-backend.sh"
validate_script_executable "scripts/deploy-frontend.sh"
validate_script_executable "scripts/rollback.sh"

echo ""
echo "📋 Checking configuration files..."
CONFIG_VALID=true

validate_file "infrastructure/cdk.context.json" || CONFIG_VALID=false
validate_file "frontend/.env.staging" || CONFIG_VALID=false
validate_file "frontend/.env.production" || CONFIG_VALID=false
validate_file "DEPLOYMENT.md" || CONFIG_VALID=false

validate_json "infrastructure/cdk.context.json"
validate_json "package.json"

echo ""
echo "📋 Checking package.json scripts..."
PACKAGE_SCRIPTS_VALID=true

# Check if deployment scripts exist in package.json
if grep -q "deploy:staging" package.json; then
    echo -e "${GREEN}✅ deploy:staging script exists${NC}"
else
    echo -e "${RED}❌ deploy:staging script missing${NC}"
    PACKAGE_SCRIPTS_VALID=false
fi

if grep -q "deploy:production" package.json; then
    echo -e "${GREEN}✅ deploy:production script exists${NC}"
else
    echo -e "${RED}❌ deploy:production script missing${NC}"
    PACKAGE_SCRIPTS_VALID=false
fi

if grep -q "rollback:production" package.json; then
    echo -e "${GREEN}✅ rollback:production script exists${NC}"
else
    echo -e "${RED}❌ rollback:production script missing${NC}"
    PACKAGE_SCRIPTS_VALID=false
fi

echo ""
echo "📋 Checking workspace structure..."
STRUCTURE_VALID=true

validate_directory "frontend" || STRUCTURE_VALID=false
validate_directory "backend" || STRUCTURE_VALID=false
validate_directory "infrastructure" || STRUCTURE_VALID=false
validate_directory ".github/workflows" || STRUCTURE_VALID=false
validate_directory "scripts" || STRUCTURE_VALID=false

echo ""
echo "📋 Checking environment-specific configurations..."
ENV_CONFIG_VALID=true

# Check frontend environment files
if [ -f "frontend/.env.staging" ]; then
    if grep -q "VITE_ENVIRONMENT=staging" frontend/.env.staging; then
        echo -e "${GREEN}✅ Staging environment configured${NC}"
    else
        echo -e "${RED}❌ Staging environment misconfigured${NC}"
        ENV_CONFIG_VALID=false
    fi
else
    echo -e "${RED}❌ Staging environment file missing${NC}"
    ENV_CONFIG_VALID=false
fi

if [ -f "frontend/.env.production" ]; then
    if grep -q "VITE_ENVIRONMENT=production" frontend/.env.production; then
        echo -e "${GREEN}✅ Production environment configured${NC}"
    else
        echo -e "${RED}❌ Production environment misconfigured${NC}"
        ENV_CONFIG_VALID=false
    fi
else
    echo -e "${RED}❌ Production environment file missing${NC}"
    ENV_CONFIG_VALID=false
fi

echo ""
echo "📋 Checking security configurations..."
SECURITY_VALID=true

# Check for security scanning in workflows
if grep -q "snyk" .github/workflows/ci.yml; then
    echo -e "${GREEN}✅ Snyk security scanning configured${NC}"
else
    echo -e "${YELLOW}⚠️  Snyk security scanning not found${NC}"
fi

if grep -q "trivy" .github/workflows/security-scan.yml; then
    echo -e "${GREEN}✅ Trivy vulnerability scanning configured${NC}"
else
    echo -e "${RED}❌ Trivy vulnerability scanning missing${NC}"
    SECURITY_VALID=false
fi

if grep -q "checkov" .github/workflows/security-scan.yml; then
    echo -e "${GREEN}✅ Checkov infrastructure scanning configured${NC}"
else
    echo -e "${RED}❌ Checkov infrastructure scanning missing${NC}"
    SECURITY_VALID=false
fi

echo ""
echo "📋 Final validation summary..."

if [ "$WORKFLOWS_VALID" = true ] && [ "$SCRIPTS_VALID" = true ] && [ "$CONFIG_VALID" = true ] && [ "$PACKAGE_SCRIPTS_VALID" = true ] && [ "$STRUCTURE_VALID" = true ] && [ "$ENV_CONFIG_VALID" = true ] && [ "$SECURITY_VALID" = true ]; then
    echo -e "${GREEN}🎉 All CI/CD deployment components are properly configured!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Configure GitHub repository secrets"
    echo "2. Set up AWS IAM roles for GitHub Actions"
    echo "3. Configure environment-specific variables"
    echo "4. Test deployment to staging environment"
    exit 0
else
    echo -e "${RED}❌ Some CI/CD components need attention${NC}"
    echo ""
    echo "Please fix the issues above before proceeding with deployment."
    exit 1
fi