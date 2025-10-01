# SQLModel database connection and session management

from sqlmodel import create_engine, Session, SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from typing import AsyncGenerator, Optional
from app.config.database import db_settings


# Global engine instances - initialized lazily
_sync_engine: Optional[object] = None
_async_engine: Optional[object] = None
_async_session_factory: Optional[sessionmaker] = None


def get_sync_engine():
    """Get or create synchronous database engine"""
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(
            db_settings.database_url_sync,
            echo=db_settings.echo_sql,
            # Connection pool settings
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,  # Validate connections before use
        )
    return _sync_engine


def get_async_engine():
    """Get or create asynchronous database engine"""
    global _async_engine
    if _async_engine is None:
        _async_engine = create_async_engine(
            db_settings.database_url_async,
            echo=db_settings.echo_sql,
            # Connection pool settings
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,  # Validate connections before use
        )
    return _async_engine


def get_async_session_factory():
    """Get or create async session factory"""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = sessionmaker(
            bind=get_async_engine(),
            class_=AsyncSession,
            expire_on_commit=False
        )
    return _async_session_factory


# FastAPI dependency injection functions
def get_sync_session():
    """Get synchronous database session for dependency injection"""
    with Session(get_sync_engine()) as session:
        yield session


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get asynchronous database session for dependency injection"""
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Database management functions
async def create_all_tables():
    """Create all tables defined in SQLModel"""
    engine = get_async_engine()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def drop_all_tables():
    """Drop all tables (DANGEROUS - dev only)"""
    engine = get_async_engine()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


async def close_connections():
    """Close all database connections"""
    global _sync_engine, _async_engine, _async_session_factory
    
    if _async_engine:
        await _async_engine.dispose()
        _async_engine = None
    
    if _sync_engine:
        _sync_engine.dispose()
        _sync_engine = None
    
    _async_session_factory = None


# Health check function
async def check_database_health() -> bool:
    """Check if database connection is healthy"""
    try:
        from sqlalchemy import text
        engine = get_async_engine()
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False