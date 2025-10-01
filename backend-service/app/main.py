"""
AI Knowledge Platform - Unified Backend Service
Combines authentication, routing, and business logic in a single service
"""

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional
import os
import time
import uuid

# Import business logic routes
from .routes.auth import router as auth_router
from .routes.organizations import router as org_router
from .routes.storage import router as storage_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    print("🚀 Starting AI Knowledge Platform Backend...")
    
    # Import all models to ensure they are registered with SQLModel
    print("📦 Loading data models...")
    import app.models  # This imports all models and registers them
    
    # Run Alembic migrations in a separate thread to avoid event loop conflicts
    import time
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    max_retries = 5
    retry_delay = 2
    
    def run_migrations():
        """Run migrations in a separate thread"""
        from alembic.config import Config
        from alembic import command
        import os
        
        # Get the alembic.ini path
        alembic_cfg_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
        alembic_cfg = Config(alembic_cfg_path)
        
        # Override database URL from environment
        db_host = os.getenv("DB_HOST", "postgres")
        db_port = os.getenv("DB_PORT", "5432") 
        db_name = os.getenv("DB_NAME", "ai_knowledge_dev")
        db_user = os.getenv("DB_USER", "dev_user")
        db_password = os.getenv("DB_PASSWORD", "dev_password_123")
        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        alembic_cfg.set_main_option("sqlalchemy.url", db_url)
        
        print("📊 Running database migrations...")
        command.upgrade(alembic_cfg, "head")
        print("✅ Database migrations completed successfully")
    
    for attempt in range(max_retries):
        try:
            print(f"🔄 Database migration attempt {attempt + 1}/{max_retries}")
            
            # Run migrations in thread pool to avoid asyncio conflict
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as executor:
                await loop.run_in_executor(executor, run_migrations)
            
            # Then seed initial data
            from .database.seeding import seeder
            seeder.seed_all()
            print("✅ Database seeding completed")
            break
            
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️  Migration attempt {attempt + 1} failed: {e}")
                print(f"� Exception type: {type(e).__name__}")
                import traceback
                print(f"🔍 Full traceback:")
                traceback.print_exc()
                print(f"�🔄 Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                print(f"❌ Database migration failed after {max_retries} attempts: {e}")
                print(f"🔍 Exception type: {type(e).__name__}")
                import traceback
                print(f"🔍 Full traceback:")
                traceback.print_exc()
                print("🚀 Starting service without database migration...")
                # Don't fail startup - service can still work
    
    yield
    
    # Shutdown
    print("🛑 Shutting down AI Knowledge Platform Backend...")


app = FastAPI(
    title="AI Knowledge Platform - Backend API",
    description="Unified backend service providing authentication, organization management, and core platform features",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Debug middleware
@app.middleware("http")
async def debug_middleware(request: Request, call_next):
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]
    
    print(f"🔍 [{request_id}] {request.method} {request.url}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    print(f"✅ [{request_id}] Response: {response.status_code} ({process_time:.3f}s)")
    
    return response

# Include routers with prefixes for organization
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(org_router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(storage_router, tags=["Storage"])

# Health check
@app.get("/health")
async def health_check():
    """Service health check"""
    return {
        "status": "healthy",
        "service": "ai-knowledge-backend",
        "version": "1.0.0",
        "timestamp": time.time(),
        "components": {
            "authentication": "healthy",
            "organizations": "healthy",
            "database": "connected"
        }
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Knowledge Platform - Backend API",
        "version": "1.0.0",
        "status": "running",
        "timestamp": time.time(),
        "docs": "/docs",
        "features": [
            "User Authentication",
            "Organization Management",
            "Permission System",
            "Database Integration"
        ]
    }

# API info endpoint
@app.get("/api/info")
async def api_info():
    """API information and available endpoints"""
    return {
        "api_version": "v1",
        "available_endpoints": {
            "auth": {
                "login": "POST /auth/login",
                "logout": "POST /auth/logout", 
                "me": "GET /auth/me"
            },
            "organizations": {
                "list": "GET /api/v1/organizations",
                "create": "POST /api/v1/organizations",
                "get": "GET /api/v1/organizations/{id}",
                "update": "PUT /api/v1/organizations/{id}",
                "delete": "DELETE /api/v1/organizations/{id}"
            }
        },
        "documentation": "/docs"
    }

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP exception handler"""
    return {
        "error": exc.detail,
        "status_code": exc.status_code,
        "request_id": str(uuid.uuid4())[:8],
        "path": str(request.url),
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="debug"
    )