"""
PostgreSQL adapter for state management.
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import asyncpg
from urllib.parse import urlparse

from src.abstractions import StateManager, TaskStatus, SourceType

logger = logging.getLogger(__name__)


class PostgreSQLStateManager(StateManager):
    """PostgreSQL state manager for task state management."""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool = None
        
    async def initialize(self):
        """Initialize PostgreSQL connection pool."""
        if self.pool is None:
            # Parse database URL
            parsed = urlparse(self.database_url)
            
            # Create connection pool
            self.pool = await asyncpg.create_pool(
                host=parsed.hostname,
                port=parsed.port or 5432,
                user=parsed.username,
                password=parsed.password,
                database=parsed.path[1:] if parsed.path.startswith('/') else parsed.path,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            
            # Initialize tables
            await self._create_tables()
            
    async def _create_tables(self):
        """Create necessary tables if they don't exist."""
        async with self.pool.acquire() as conn:
            # Create tasks table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id VARCHAR(255) PRIMARY KEY,
                    task_type VARCHAR(100) NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
                    source_location TEXT,
                    source_type VARCHAR(50),
                    metadata JSONB,
                    error_message TEXT,
                    result_data JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            
            # Create documents table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id VARCHAR(255) PRIMARY KEY,
                    title TEXT,
                    source_location TEXT,
                    source_type VARCHAR(50),
                    metadata JSONB,
                    status VARCHAR(50) DEFAULT 'processing',
                    chunk_ids TEXT[],
                    file_paths TEXT[],
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            
            # Create indexes
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)")
            
    async def create_task_record(
        self,
        task_id: str,
        task_type: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Create initial task record."""
        try:
            async with self.pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO tasks (id, task_type, status, source_location, source_type, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, task_id, task_type, TaskStatus.QUEUED.value, source_location, 
                    source_type.value, json.dumps(metadata) if metadata else None)
                return True
        except Exception as e:
            logger.error(f"Failed to create task record {task_id}: {e}")
            return False
    
    async def update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        error_message: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update task status."""
        try:
            async with self.pool.acquire() as conn:
                await conn.execute("""
                    UPDATE tasks 
                    SET status = $1, error_message = $2, result_data = $3, updated_at = NOW()
                    WHERE id = $4
                """, status.value, error_message, 
                    json.dumps(result_data) if result_data else None, task_id)
                return True
        except Exception as e:
            logger.error(f"Failed to update task status {task_id}: {e}")
            return False
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get current task status and details."""
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT id, task_type, status, source_location, source_type, 
                           metadata, error_message, result_data, created_at, updated_at
                    FROM tasks WHERE id = $1
                """, task_id)
                
                if row:
                    return {
                        "id": row["id"],
                        "task_type": row["task_type"],
                        "status": row["status"],
                        "source_location": row["source_location"],
                        "source_type": row["source_type"],
                        "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                        "error_message": row["error_message"],
                        "result_data": json.loads(row["result_data"]) if row["result_data"] else {},
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"]
                    }
                return None
        except Exception as e:
            logger.error(f"Failed to get task status {task_id}: {e}")
            return None
    
    async def list_tasks(
        self,
        status_filter: Optional[TaskStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List tasks with optional filtering."""
        try:
            async with self.pool.acquire() as conn:
                if status_filter:
                    rows = await conn.fetch("""
                        SELECT id, task_type, status, source_location, source_type,
                               metadata, error_message, result_data, created_at, updated_at
                        FROM tasks WHERE status = $1
                        ORDER BY created_at DESC
                        LIMIT $2 OFFSET $3
                    """, status_filter.value, limit, offset)
                else:
                    rows = await conn.fetch("""
                        SELECT id, task_type, status, source_location, source_type,
                               metadata, error_message, result_data, created_at, updated_at
                        FROM tasks
                        ORDER BY created_at DESC
                        LIMIT $1 OFFSET $2
                    """, limit, offset)
                
                tasks = []
                for row in rows:
                    tasks.append({
                        "id": row["id"],
                        "task_type": row["task_type"],
                        "status": row["status"],
                        "source_location": row["source_location"],
                        "source_type": row["source_type"],
                        "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                        "error_message": row["error_message"],
                        "result_data": json.loads(row["result_data"]) if row["result_data"] else {},
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"]
                    })
                return tasks
        except Exception as e:
            logger.error(f"Failed to list tasks: {e}")
            return []
    
    async def store_document_record(
        self,
        document_id: str,
        title: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None,
        chunk_ids: Optional[List[str]] = None,
        file_paths: Optional[List[str]] = None
    ) -> bool:
        """Store document record."""
        try:
            async with self.pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO documents (id, title, source_location, source_type, metadata, chunk_ids, file_paths)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        metadata = EXCLUDED.metadata,
                        chunk_ids = EXCLUDED.chunk_ids,
                        file_paths = EXCLUDED.file_paths,
                        updated_at = NOW()
                """, document_id, title, source_location, source_type.value,
                    json.dumps(metadata) if metadata else None,
                    chunk_ids or [], file_paths or [])
                return True
        except Exception as e:
            logger.error(f"Failed to store document record {document_id}: {e}")
            return False
    
    async def get_document_record(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document record."""
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT id, title, source_location, source_type, metadata, 
                           status, chunk_ids, file_paths, created_at, updated_at
                    FROM documents WHERE id = $1
                """, document_id)
                
                if row:
                    return {
                        "id": row["id"],
                        "title": row["title"],
                        "source_location": row["source_location"],
                        "source_type": row["source_type"],
                        "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                        "status": row["status"],
                        "chunk_ids": row["chunk_ids"] or [],
                        "file_paths": row["file_paths"] or [],
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"]
                    }
                return None
        except Exception as e:
            logger.error(f"Failed to get document record {document_id}: {e}")
            return None
    
    # Legacy methods for compatibility with existing code
    async def get_state(self, key: str) -> Optional[Dict[str, Any]]:
        """Get state by key (legacy compatibility)."""
        if key.startswith("task:"):
            task_id = key[5:]  # Remove "task:" prefix
            return await self.get_task_status(task_id)
        elif key.startswith("document:"):
            doc_id = key[9:]  # Remove "document:" prefix
            return await self.get_document_record(doc_id)
        return None
    
    async def set_state(self, key: str, data: Dict[str, Any]) -> bool:
        """Set state by key (legacy compatibility)."""
        try:
            if key.startswith("task:"):
                task_id = key[5:]
                # This is a simplified approach - in practice you'd want proper task creation
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO tasks (id, task_type, status, metadata)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (id) DO UPDATE SET
                            metadata = EXCLUDED.metadata,
                            updated_at = NOW()
                    """, task_id, 
                        data.get("task_type", "unknown"),
                        data.get("status", "QUEUED"),
                        json.dumps(data))
                return True
            elif key.startswith("document:"):
                doc_id = key[9:]
                return await self.store_document_record(
                    doc_id,
                    data.get("title", ""),
                    data.get("source_location", ""),
                    SourceType(data.get("source_type", "file")),
                    data.get("metadata"),
                    data.get("chunk_ids"),
                    data.get("file_paths")
                )
            return False
        except Exception as e:
            logger.error(f"Failed to set state for {key}: {e}")
            return False
    
    async def delete_state(self, key: str) -> bool:
        """Delete state by key (legacy compatibility)."""
        try:
            async with self.pool.acquire() as conn:
                if key.startswith("task:"):
                    task_id = key[5:]
                    await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)
                elif key.startswith("document:"):
                    doc_id = key[9:]
                    await conn.execute("DELETE FROM documents WHERE id = $1", doc_id)
                return True
        except Exception as e:
            logger.error(f"Failed to delete state for {key}: {e}")
            return False
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """List keys with prefix (legacy compatibility)."""
        try:
            async with self.pool.acquire() as conn:
                if prefix == "task:":
                    rows = await conn.fetch("SELECT id FROM tasks ORDER BY created_at DESC")
                    return [f"task:{row['id']}" for row in rows]
                elif prefix == "document:":
                    rows = await conn.fetch("SELECT id FROM documents ORDER BY created_at DESC")
                    return [f"document:{row['id']}" for row in rows]
                return []
        except Exception as e:
            logger.error(f"Failed to list keys with prefix {prefix}: {e}")
            return []