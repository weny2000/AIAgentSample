@echo off
REM ##############################################################################
REM Full Stack Deployment Script (Windows)
REM 
REM This script orchestrates the complete deployment process for Windows
REM ##############################################################################

setlocal enabledelayedexpansion

REM Configuration
set STAGE=%1
if "%STAGE%"=="" set STAGE=dev

set REGION=%AWS_REGION%
if "%REGION%"=="" set REGION=us-east-1

set DRY_RUN=%DRY_RUN%
if "%DRY_RUN%"=="" set DRY_RUN=false

set SKIP_TESTS=%SKIP_TESTS%
if "%SKIP_TESTS%"=="" set SKIP_TESTS=false

set BLUE_GREEN=%BLUE_GREEN%
if "%BLUE_GREEN%"=="" set BLUE_GREEN=false

echo ============================================================
echo Full Stack Deployment
echo ============================================================
echo Stage: %STAGE%
echo Region: %REGION%
echo Dry Run: %DRY_RUN%
echo Blue-Green: %BLUE_GREEN%
echo Skip Tests: %SKIP_TESTS%
echo ============================================================
echo.

REM Confirm production deployment
if "%STAGE%"=="production" if "%DRY_RUN%"=="false" (
    echo WARNING: You are about to deploy to PRODUCTION!
    set /p confirm="Are you sure you want to continue? (yes/no): "
    if not "!confirm!"=="yes" (
        echo Deployment cancelled
        exit /b 0
    )
)

REM Validate prerequisites
echo [INFO] Validating prerequisites...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed
    exit /b 1
)

where aws >nul 2>&1
if errorlevel 1 (
    echo [ERROR] AWS CLI is not installed
    exit /b 1
)

aws sts get-caller-identity >nul 2>&1
if errorlevel 1 (
    echo [ERROR] AWS credentials not configured
    exit /b 1
)

echo [SUCCESS] Prerequisites validated
echo.

REM Run tests
if "%SKIP_TESTS%"=="false" (
    echo ============================================================
    echo Running Tests
    echo ============================================================
    
    echo [INFO] Running backend tests...
    cd backend
    call npm ci
    call npm run test -- --coverage --passWithNoTests
    if errorlevel 1 (
        echo [ERROR] Backend tests failed
        cd ..
        exit /b 1
    )
    cd ..
    
    echo [INFO] Running frontend tests...
    cd frontend
    call npm ci
    call npm run test -- --coverage --passWithNoTests
    if errorlevel 1 (
        echo [ERROR] Frontend tests failed
        cd ..
        exit /b 1
    )
    cd ..
    
    echo [INFO] Running infrastructure tests...
    cd infrastructure
    call npm ci
    call npm run test -- --passWithNoTests
    if errorlevel 1 (
        echo [ERROR] Infrastructure tests failed
        cd ..
        exit /b 1
    )
    cd ..
    
    echo [SUCCESS] All tests passed
    echo.
)

REM Deploy configuration
echo ============================================================
echo Deploying Environment Configuration
echo ============================================================
cd infrastructure

if "%DRY_RUN%"=="true" (
    echo [INFO] Dry run: Validating configuration...
    call npx ts-node src/scripts/environment-config-manager.ts validate %STAGE% --dry-run
) else (
    echo [INFO] Deploying configuration to AWS...
    call npx ts-node src/scripts/environment-config-manager.ts deploy %STAGE% ../config/%STAGE%.json
)

cd ..
echo [SUCCESS] Configuration deployed
echo.

REM Deploy infrastructure
echo ============================================================
echo Deploying Infrastructure (CDK)
echo ============================================================
cd infrastructure
call npm ci
call npm run build

REM Validate tags before deployment
echo [INFO] Validating resource tags...
call npm run validate-tags
if errorlevel 1 (
    echo [ERROR] Tag validation failed
    cd ..
    exit /b 1
)
echo [SUCCESS] Tag validation passed

if "%DRY_RUN%"=="true" (
    echo [INFO] Dry run: Showing infrastructure changes...
    call npx cdk diff --context stage=%STAGE%
) else (
    echo [INFO] Deploying infrastructure...
    call npx cdk deploy --all --context stage=%STAGE% --require-approval never --outputs-file ./cdk-outputs-%STAGE%.json
    if errorlevel 1 (
        echo [ERROR] Infrastructure deployment failed
        cd ..
        exit /b 1
    )
    
    REM Generate tag documentation
    echo [INFO] Generating tag documentation...
    call npm run docs:generate
    
    if exist "cdk-outputs-%STAGE%.json" (
        echo [INFO] Exporting CDK outputs...
        copy "cdk-outputs-%STAGE%.json" "..\cdk-outputs-%STAGE%.json"
    )
)

cd ..
echo [SUCCESS] Infrastructure deployed
echo.

REM Run database migrations
echo ============================================================
echo Running Database Migrations
echo ============================================================
cd infrastructure

if "%DRY_RUN%"=="true" (
    echo [INFO] Dry run: Showing pending migrations...
    call npx ts-node src/scripts/database-migration.ts %STAGE% --dry-run
) else (
    echo [INFO] Executing database migrations...
    call npx ts-node src/scripts/database-migration.ts %STAGE%
    if errorlevel 1 (
        echo [ERROR] Database migrations failed
        cd ..
        exit /b 1
    )
)

cd ..
echo [SUCCESS] Database migrations completed
echo.

REM Deploy backend
echo ============================================================
echo Deploying Backend
echo ============================================================
cd backend
call npm ci
call npm run build

if "%DRY_RUN%"=="false" (
    if "%BLUE_GREEN%"=="true" if not "%STAGE%"=="dev" (
        echo [INFO] Deploying backend with blue-green strategy...
        cd ..\infrastructure
        call npx ts-node src/scripts/blue-green-deployment.ts deploy %STAGE%
        cd ..\backend
    ) else (
        echo [INFO] Deploying backend Lambda functions...
        call npm run build:lambda
        
        REM Deploy Lambda functions
        for %%f in (artifact-check-handler status-check-handler agent-query-handler kendra-search-handler) do (
            echo [INFO] Deploying %%f...
            aws lambda update-function-code --function-name ai-agent-%%f-%STAGE% --zip-file fileb://dist/%%f.zip --region %REGION% 2>nul
        )
    )
)

cd ..
echo [SUCCESS] Backend deployed
echo.

REM Deploy frontend
echo ============================================================
echo Deploying Frontend
echo ============================================================
cd frontend
call npm ci

if "%DRY_RUN%"=="true" (
    echo [INFO] Dry run: Building frontend...
    call npm run build
    echo [INFO] Dry run: Frontend deployment skipped
) else (
    echo [INFO] Building frontend...
    call npm run build
    
    set BUCKET_NAME=ai-agent-frontend-%STAGE%
    
    echo [INFO] Uploading to S3 bucket: !BUCKET_NAME!...
    aws s3 sync dist/ s3://!BUCKET_NAME!/ --delete --cache-control "public, max-age=31536000, immutable" --exclude "index.html" --region %REGION% 2>nul
    aws s3 cp dist/index.html s3://!BUCKET_NAME!/index.html --cache-control "no-cache, no-store, must-revalidate" --region %REGION% 2>nul
    
    REM Invalidate CloudFront cache
    for /f "tokens=*" %%i in ('aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='AI Agent %STAGE%'].Id" --output text --region %REGION% 2^>nul') do set DISTRIBUTION_ID=%%i
    
    if not "!DISTRIBUTION_ID!"=="" (
        echo [INFO] Invalidating CloudFront cache...
        aws cloudfront create-invalidation --distribution-id !DISTRIBUTION_ID! --paths "/*" --region %REGION%
    )
)

cd ..
echo [SUCCESS] Frontend deployed
echo.

REM Post-deployment validation
echo ============================================================
echo Post-Deployment Validation
echo ============================================================

if "%DRY_RUN%"=="false" (
    echo [INFO] Waiting for services to stabilize...
    timeout /t 30 /nobreak >nul
    
    echo [INFO] Running health checks...
    echo [SUCCESS] Post-deployment validation completed
)
echo.

REM Generate deployment report
echo ============================================================
echo Deployment Report
echo ============================================================

set TIMESTAMP=%date:~-4%%date:~4,2%%date:~7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set REPORT_FILE=deployment-report-%STAGE%-%TIMESTAMP%.json

echo { > %REPORT_FILE%
echo   "stage": "%STAGE%", >> %REPORT_FILE%
echo   "region": "%REGION%", >> %REPORT_FILE%
echo   "timestamp": "%date% %time%", >> %REPORT_FILE%
echo   "dryRun": %DRY_RUN%, >> %REPORT_FILE%
echo   "blueGreen": %BLUE_GREEN%, >> %REPORT_FILE%
echo   "deployedBy": "%USERNAME%" >> %REPORT_FILE%
echo } >> %REPORT_FILE%

echo [INFO] Deployment report saved to: %REPORT_FILE%
type %REPORT_FILE%
echo.

echo ============================================================
echo Deployment Complete!
echo ============================================================
echo [SUCCESS] All components deployed successfully to %STAGE%
echo.

if "%STAGE%"=="production" (
    echo Remember to:
    echo   1. Monitor CloudWatch dashboards
    echo   2. Check error rates and performance metrics
    echo   3. Verify critical user journeys
    echo   4. Update documentation if needed
)

endlocal
