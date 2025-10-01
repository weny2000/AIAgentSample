# Database initialization module for FastAPI applications

import asyncio
from sqlmodel import SQLModel
from app.database.connection import async_engine, create_all_tables, close_connections
from app.config.database import db_settings


async def init_database():
    """Initialize database for FastAPI app startup"""
    try:
        print("Initializing database...")
        
        # Create all tables
        await create_all_tables()
        
        print("✓ Database initialization completed")
        
    except Exception as e:
        print(f"✗ Database initialization failed: {e}")
        raise


async def cleanup_database():
    """Cleanup database connections on app shutdown"""
    try:
        print("Closing database connections...")
        await close_connections()
        print("✓ Database cleanup completed")
    except Exception as e:
        print(f"⚠ Database cleanup warning: {e}")


# FastAPI lifespan context manager
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan context manager"""
    # Startup
    await init_database()
    yield
    # Shutdown  
    await cleanup_database()