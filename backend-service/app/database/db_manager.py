#!/usr/bin/env python3
"""
SQLModel Database Management Tool
Simple database operations for AI Knowledge Platform
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

from app.database.connection import (
    create_all_tables,
    drop_all_tables,
    close_connections,
    get_async_engine,
    check_database_health
)
from app.config.database import db_settings
from sqlalchemy import text


class SQLModelDBManager:
    """Simple database management for SQLModel"""
    
    async def check_connection(self):
        """Test database connection"""
        try:
            engine = get_async_engine()
            async with engine.begin() as conn:
                result = await conn.execute(text("SELECT version();"))
                version = result.fetchone()[0]
                print(f"✓ Connected to PostgreSQL: {version}")
                return True
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            print("Please check:")
            print(f"- Database URL: {db_settings.database_url_async}")
            print("- PostgreSQL service is running")
            print("- Database credentials are correct")
            return False
    
    async def create_database_if_not_exists(self):
        """Create database if it doesn't exist"""
        try:
            # Connect to postgres database to create our target database
            from sqlalchemy.ext.asyncio import create_async_engine
            postgres_url = db_settings.database_url_async.replace(
                f"/{db_settings.db_name}", "/postgres"
            )
            
            # Create engine with isolation_level="AUTOCOMMIT" for DDL operations
            postgres_engine = create_async_engine(
                postgres_url,
                isolation_level="AUTOCOMMIT"
            )
            
            # Check if database exists and create if needed
            async with postgres_engine.connect() as conn:
                # Check if database exists
                result = await conn.execute(text(
                    "SELECT 1 FROM pg_database WHERE datname = :db_name"
                ), {"db_name": db_settings.db_name})
                
                if not result.fetchone():
                    # Create database (AUTOCOMMIT mode handles transaction automatically)
                    await conn.execute(text(f'CREATE DATABASE "{db_settings.db_name}"'))
                    print(f"✓ Created database: {db_settings.db_name}")
                else:
                    print(f"✓ Database already exists: {db_settings.db_name}")
            
            await postgres_engine.dispose()
            return True
            
        except Exception as e:
            print(f"✗ Error creating database: {e}")
            return False
    
    async def create_tables(self):
        """Create all tables from SQLModel metadata"""
        try:
            print("Creating tables from SQLModel...")
            await create_all_tables()
            print("✓ All tables created successfully")
            return True
        except Exception as e:
            print(f"✗ Error creating tables: {e}")
            return False
    
    async def drop_tables(self):
        """Drop all tables (DANGEROUS!)"""
        print("⚠️  WARNING: This will DROP ALL TABLES!")
        response = input("Type 'DELETE ALL TABLES' to confirm: ")
        if response != "DELETE ALL TABLES":
            print("Operation cancelled")
            return
        
        try:
            await drop_all_tables()
            print("✓ All tables dropped")
        except Exception as e:
            print(f"✗ Error dropping tables: {e}")
    
    async def show_tables(self):
        """Show existing tables"""
        try:
            engine = get_async_engine()
            async with engine.begin() as conn:
                result = await conn.execute(text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                """))
                
                tables = result.fetchall()
                table_count = len(tables)
                
                if tables:
                    print("\nExisting tables:")
                    print("-" * 30)
                    for (table_name,) in tables:
                        print(f"- {table_name}")
                else:
                    print("No tables found")
                
                return table_count
                    
        except Exception as e:
            print(f"✗ Error listing tables: {e}")
            return 0
    
    async def health_check(self):
        """Check database health"""
        print("Checking database health...")
        is_healthy = await check_database_health()
        if is_healthy:
            print("✓ Database is healthy")
        else:
            print("✗ Database health check failed")
        return is_healthy
    
    async def show_status(self):
        """Show comprehensive database status"""
        print("Database Status Report")
        print("=" * 40)
        
        # Configuration
        print(f"Host: {db_settings.db_host}")
        print(f"Port: {db_settings.db_port}")
        print(f"Database: {db_settings.db_name}")
        print(f"User: {db_settings.db_user}")
        
        # Connection test
        print("\nConnection Test:")
        is_connected = await self.check_connection()
        
        if is_connected:
            # Health check
            print("\nHealth Check:")
            await self.health_check()
            
            # Table count
            print("\nTables:")
            await self.show_tables()
    
    async def init_full(self):
        """Full initialization: create database and tables"""
        print("Full database initialization...")
        if await self.create_database_if_not_exists():
            if await self.check_connection():
                await self.create_tables()
                print("✓ Database initialization completed")


async def main():
    """CLI interface"""
    manager = SQLModelDBManager()
    
    if len(sys.argv) < 2:
        print("SQLModel Database Manager")
        print("========================")
        print("Commands:")
        print("  check         - Test database connection")
        print("  create-db     - Create database if not exists")
        print("  create-tables - Create all tables")
        print("  drop-tables   - Drop all tables (DANGEROUS)")
        print("  show-tables   - List existing tables") 
        print("  health        - Check database health")
        print("  status        - Show comprehensive status")
        print("  init          - Full init (create db + tables)")
        return
    
    command = sys.argv[1].lower()
    
    try:
        if command == "check":
            await manager.check_connection()
        elif command == "create-db":
            await manager.create_database_if_not_exists()
        elif command == "create-tables":
            await manager.create_tables()
        elif command == "drop-tables":
            await manager.drop_tables()
        elif command == "show-tables":
            await manager.show_tables()
        elif command == "health":
            await manager.health_check()
        elif command == "status":
            await manager.show_status()
        elif command == "init":
            await manager.init_full()
        else:
            print(f"Unknown command: {command}")
    
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await close_connections()


if __name__ == "__main__":
    asyncio.run(main())