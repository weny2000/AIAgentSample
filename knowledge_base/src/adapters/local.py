"""
Local service adapters for development and POC environments.
"""

import os
import json
import sqlite3
import redis
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import hashlib
import pickle
import logging

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import numpy as np

from src.abstractions import (
    EmbeddingProvider, VectorDatabase, StorageProvider, 
    TaskQueue, StateManager, WorkflowOrchestrator
)
from src.core.models import Document, DocumentChunk, KnowledgeChunk, IngestionTask

logger = logging.getLogger(__name__)


class LocalEmbeddingProvider(EmbeddingProvider):
    """Local embedding provider using sentence-transformers."""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        
    async def initialize(self):
        """Initialize the embedding model."""
        if self.model is None:
            # Load model in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None, SentenceTransformer, self.model_name
            )
        
    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        if self.model is None:
            await self.initialize()
            
        # Generate embeddings in thread pool
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None, self.model.encode, texts
        )
        
        return embeddings.tolist()
    
    async def get_embedding(self, text: str) -> List[float]:
        """Generate embedding for single text."""
        embeddings = await self.generate_embeddings([text])
        return embeddings[0]
    
    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        return await self.generate_embeddings(texts)
    
    def get_embedding_dimension(self) -> int:
        """Get the embedding dimension."""
        if self.model is None:
            # Initialize synchronously for dimension query
            self.model = SentenceTransformer(self.model_name)
        return self.model.get_sentence_embedding_dimension()
    
    async def get_embedding_dimension_async(self) -> int:
        """Get the embedding dimension asynchronously."""
        if self.model is None:
            await self.initialize()
        return self.model.get_sentence_embedding_dimension()


class LocalVectorDatabase(VectorDatabase):
    """Local vector database using ChromaDB."""
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        
    async def initialize(self, collection_name: str = "knowledge_base"):
        """Initialize ChromaDB."""
        if self.client is None:
            # Initialize ChromaDB in thread pool
            loop = asyncio.get_event_loop()
            self.client = await loop.run_in_executor(
                None, 
                lambda: chromadb.PersistentClient(
                    path=self.persist_directory,
                    settings=Settings(anonymized_telemetry=False)
                )
            )
            
        # Get or create collection
        loop = asyncio.get_event_loop()  # Re-acquire loop reference
        self.collection = await loop.run_in_executor(
            None,
            lambda: self.client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
        )
    
    async def add_vectors(
        self, 
        vectors: List[List[float]], 
        metadatas: List[Dict[str, Any]], 
        ids: List[str]
    ):
        """Add vectors to the database."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.collection.add(
                embeddings=vectors,
                metadatas=metadatas,
                ids=ids
            )
        )
    
    async def search_vectors(
        self, 
        query_vector: List[float], 
        limit: int = 10,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Search for similar vectors."""
        loop = asyncio.get_event_loop()
        
        # Prepare where clause for filtering
        where_clause = filter_dict if filter_dict else None
        
        results = await loop.run_in_executor(
            None,
            lambda: self.collection.query(
                query_embeddings=[query_vector],
                n_results=limit,
                where=where_clause
            )
        )
        
        # Format results
        formatted_results = []
        if results['ids'] and results['ids'][0]:
            for i, doc_id in enumerate(results['ids'][0]):
                distance = results['distances'][0][i]
                metadata = results['metadatas'][0][i] if results['metadatas'][0] else {}
                formatted_results.append((doc_id, 1 - distance, metadata))  # Convert distance to similarity
                
        return formatted_results
    
    async def delete_vectors(self, ids: List[str]):
        """Delete vectors by IDs."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.collection.delete(ids=ids)
        )
    
    async def update_vectors(
        self, 
        ids: List[str], 
        vectors: List[List[float]], 
        metadatas: List[Dict[str, Any]]
    ):
        """Update existing vectors."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.collection.update(
                ids=ids,
                embeddings=vectors,
                metadatas=metadatas
            )
        )
    
    async def create_index(self, index_name: str, dimension: int, **kwargs) -> bool:
        """Create a new vector index (collection in ChromaDB)."""
        try:
            await self.initialize(collection_name=index_name)
            return True
        except Exception as e:
            logger.error(f"Failed to create index {index_name}: {e}")
            return False
    
    async def index_documents(
        self, 
        index_name: str,
        documents: List[Dict[str, Any]]
    ) -> bool:
        """Index documents with their vectors and metadata."""
        try:
            # Ensure we're working with the correct collection
            await self.initialize(collection_name=index_name)
            
            # Extract data from documents
            ids = [doc['id'] for doc in documents]
            vectors = [doc['vector'] for doc in documents]
            metadatas = []
            
            for doc in documents:
                metadata = doc.get('metadata', {}).copy()
                metadata['content'] = doc.get('content', '')
                
                # Convert list fields to strings for ChromaDB compatibility
                for key, value in metadata.items():
                    if isinstance(value, list):
                        if key in ['auto_tags', 'manual_tags', 'tags']:
                            # Join tags with commas
                            metadata[key] = ','.join(str(tag) for tag in value) if value else ''
                        else:
                            # Convert other lists to JSON strings
                            metadata[key] = str(value)
                    elif isinstance(value, dict):
                        # Convert dict to JSON string
                        import json
                        metadata[key] = json.dumps(value)
                
                metadatas.append(metadata)
            
            await self.add_vectors(vectors, metadatas, ids)
            return True
            
        except Exception as e:
            logger.error(f"Failed to index documents in {index_name}: {e}")
            return False
    
    async def search(
        self,
        index_name: str,
        query_vector: List[float],
        top_k: int = 5,
        filter_criteria: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors."""
        try:
            # Ensure we're working with the correct collection
            await self.initialize(collection_name=index_name)
            
            results = await self.search_vectors(
                query_vector=query_vector,
                limit=top_k,
                filter_dict=filter_criteria
            )
            
            # Format results according to expected structure
            formatted_results = []
            for doc_id, score, metadata in results:
                result = {
                    'id': doc_id,
                    'score': score,
                    'content': metadata.get('content', ''),
                    'metadata': {k: v for k, v in metadata.items() if k != 'content'}
                }
                formatted_results.append(result)
                
            return formatted_results
            
        except Exception as e:
            logger.error(f"Failed to search in {index_name}: {e}")
            return []
    
    async def delete_index(self, index_name: str) -> bool:
        """Delete an index (collection in ChromaDB)."""
        try:
            if self.client is None:
                await self.initialize()
                
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.client.delete_collection(name=index_name)
            )
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete index {index_name}: {e}")
            return False


class LocalStorageProvider(StorageProvider):
    """Local file storage provider."""
    
    def __init__(self, base_path: str = "./storage"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)
        
    async def store_file(self, file_path: str, content: bytes) -> str:
        """Store file locally."""
        full_path = os.path.join(self.base_path, file_path.lstrip('/'))
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Write file in thread pool
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: open(full_path, 'wb').write(content)
        )
        
        return full_path
    
    async def retrieve_file(self, file_path: str) -> bytes:
        """Retrieve file from local storage."""
        full_path = os.path.join(self.base_path, file_path.lstrip('/'))
        
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        # Read file in thread pool
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(
            None,
            lambda: open(full_path, 'rb').read()
        )
        
        return content
    
    async def delete_file(self, file_path: str):
        """Delete file from local storage."""
        full_path = os.path.join(self.base_path, file_path.lstrip('/'))
        
        if os.path.exists(full_path):
            await asyncio.get_event_loop().run_in_executor(
                None, os.remove, full_path
            )
    
    async def list_files(self, prefix: str = "") -> List[str]:
        """List files with optional prefix."""
        full_prefix = os.path.join(self.base_path, prefix.lstrip('/'))
        files = []
        
        def _walk_files():
            for root, dirs, filenames in os.walk(full_prefix):
                for filename in filenames:
                    rel_path = os.path.relpath(
                        os.path.join(root, filename), 
                        self.base_path
                    )
                    files.append(rel_path)
        
        await asyncio.get_event_loop().run_in_executor(None, _walk_files)
        return files


class LocalTaskQueue(TaskQueue):
    """Local task queue using Redis."""
    
    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis_url = redis_url
        self.redis_client = None
        
    async def initialize(self):
        """Initialize Redis connection."""
        if self.redis_client is None:
            self.redis_client = redis.from_url(
                self.redis_url, 
                decode_responses=True
            )
    
    async def enqueue_task(self, queue_name: str, task_data: Dict[str, Any]) -> str:
        """Enqueue a task."""
        if self.redis_client is None:
            await self.initialize()
            
        task_id = hashlib.md5(
            f"{queue_name}_{datetime.now().isoformat()}_{json.dumps(task_data)}".encode()
        ).hexdigest()
        
        task_payload = {
            "id": task_id,
            "data": task_data,
            "created_at": datetime.now().isoformat(),
            "status": "pending"
        }
        
        # Add to queue and store task data
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: [
                self.redis_client.lpush(queue_name, task_id),
                self.redis_client.hset(f"task:{task_id}", mapping=task_payload)
            ]
        )
        
        return task_id
    
    async def dequeue_task(self, queue_name: str, timeout: int = 30) -> Optional[Dict[str, Any]]:
        """Dequeue a task."""
        if self.redis_client is None:
            await self.initialize()
            
        # Blocking pop with timeout
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.redis_client.brpop(queue_name, timeout=timeout)
        )
        
        if result:
            queue, task_id = result
            task_data = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.redis_client.hgetall(f"task:{task_id}")
            )
            
            if task_data:
                task_data['data'] = json.loads(task_data['data'])
                return task_data
                
        return None
    
    async def get_task_status(self, task_id: str) -> Optional[str]:
        """Get task status."""
        if self.redis_client is None:
            await self.initialize()
            
        status = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.redis_client.hget(f"task:{task_id}", "status")
        )
        
        return status
    
    async def update_task_status(self, task_id: str, status: str, result: Optional[Dict[str, Any]] = None):
        """Update task status."""
        if self.redis_client is None:
            await self.initialize()
            
        updates = {
            "status": status,
            "updated_at": datetime.now().isoformat()
        }
        
        if result:
            updates["result"] = json.dumps(result)
            
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.redis_client.hset(f"task:{task_id}", mapping=updates)
        )


class LocalStateManager(StateManager):
    """Local state manager using SQLite."""
    
    def __init__(self, db_path: str = "./state.db"):
        self.db_path = db_path
        self.conn = None
        
    async def initialize(self):
        """Initialize SQLite database."""
        if self.conn is None:
            self.conn = await asyncio.get_event_loop().run_in_executor(
                None, sqlite3.connect, self.db_path
            )
            
            # Create tables
            await asyncio.get_event_loop().run_in_executor(
                None, self._create_tables
            )
    
    def _create_tables(self):
        """Create necessary tables."""
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS state_data (
                key TEXT PRIMARY KEY,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_records (
                task_id TEXT PRIMARY KEY,
                task_type TEXT NOT NULL,
                status TEXT NOT NULL,
                source_location TEXT,
                source_type TEXT,
                metadata TEXT,
                error_message TEXT,
                result_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()
    
    async def get_state(self, key: str) -> Optional[Any]:
        """Get state value."""
        if self.conn is None:
            await self.initialize()
            
        def _get():
            cursor = self.conn.cursor()
            cursor.execute("SELECT value FROM state_data WHERE key = ?", (key,))
            result = cursor.fetchone()
            return pickle.loads(result[0]) if result else None
            
        return await asyncio.get_event_loop().run_in_executor(None, _get)
    
    async def set_state(self, key: str, value: Any):
        """Set state value."""
        if self.conn is None:
            await self.initialize()
            
        def _set():
            cursor = self.conn.cursor()
            pickled_value = pickle.dumps(value)
            cursor.execute(
                """INSERT OR REPLACE INTO state_data (key, value, updated_at) 
                   VALUES (?, ?, CURRENT_TIMESTAMP)""",
                (key, pickled_value)
            )
            self.conn.commit()
            
        await asyncio.get_event_loop().run_in_executor(None, _set)
    
    async def delete_state(self, key: str):
        """Delete state value."""
        if self.conn is None:
            await self.initialize()
            
        def _delete():
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM state_data WHERE key = ?", (key,))
            self.conn.commit()
            
        await asyncio.get_event_loop().run_in_executor(None, _delete)
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """List all keys with optional prefix."""
        if self.conn is None:
            await self.initialize()
            
        def _list():
            cursor = self.conn.cursor()
            if prefix:
                cursor.execute("SELECT key FROM state_data WHERE key LIKE ?", (f"{prefix}%",))
            else:
                cursor.execute("SELECT key FROM state_data")
            return [row[0] for row in cursor.fetchall()]
            
        return await asyncio.get_event_loop().run_in_executor(None, _list)
    
    async def create_task_record(
        self,
        task_id: str,
        task_type: str,
        source_location: str,
        source_type,  # SourceType enum
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Create initial task record."""
        if self.conn is None:
            await self.initialize()
            
        def _create():
            try:
                cursor = self.conn.cursor()
                cursor.execute(
                    """INSERT INTO task_records 
                       (task_id, task_type, status, source_location, source_type, metadata)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        task_id, 
                        task_type, 
                        "QUEUED",  # Initial status
                        source_location,
                        source_type.value if hasattr(source_type, 'value') else str(source_type),
                        json.dumps(metadata) if metadata else None
                    )
                )
                self.conn.commit()
                return True
            except Exception as e:
                logger.error(f"Failed to create task record {task_id}: {e}")
                return False
                
        return await asyncio.get_event_loop().run_in_executor(None, _create)
    
    async def update_task_status(
        self,
        task_id: str,
        status,  # TaskStatus enum
        error_message: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update task status."""
        if self.conn is None:
            await self.initialize()
            
        def _update():
            try:
                cursor = self.conn.cursor()
                cursor.execute(
                    """UPDATE task_records 
                       SET status = ?, error_message = ?, result_data = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE task_id = ?""",
                    (
                        status.value if hasattr(status, 'value') else str(status),
                        error_message,
                        json.dumps(result_data) if result_data else None,
                        task_id
                    )
                )
                self.conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Failed to update task status {task_id}: {e}")
                return False
                
        return await asyncio.get_event_loop().run_in_executor(None, _update)
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get current task status and details."""
        if self.conn is None:
            await self.initialize()
            
        def _get():
            try:
                cursor = self.conn.cursor()
                cursor.execute(
                    """SELECT task_id, task_type, status, source_location, source_type, 
                              metadata, error_message, result_data, created_at, updated_at
                       FROM task_records WHERE task_id = ?""",
                    (task_id,)
                )
                row = cursor.fetchone()
                
                if row:
                    return {
                        'task_id': row[0],
                        'task_type': row[1],
                        'status': row[2],
                        'source_location': row[3],
                        'source_type': row[4],
                        'metadata': json.loads(row[5]) if row[5] else {},
                        'error_message': row[6],
                        'result_data': json.loads(row[7]) if row[7] else None,
                        'created_at': row[8],
                        'updated_at': row[9]
                    }
                return None
            except Exception as e:
                logger.error(f"Failed to get task status {task_id}: {e}")
                return None
                
        return await asyncio.get_event_loop().run_in_executor(None, _get)
    
    async def list_tasks(
        self,
        status_filter=None,  # Optional TaskStatus enum
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List tasks with optional filtering."""
        if self.conn is None:
            await self.initialize()
            
        def _list():
            try:
                cursor = self.conn.cursor()
                
                if status_filter:
                    status_value = status_filter.value if hasattr(status_filter, 'value') else str(status_filter)
                    cursor.execute(
                        """SELECT task_id, task_type, status, source_location, source_type, 
                                  metadata, error_message, result_data, created_at, updated_at
                           FROM task_records WHERE status = ?
                           ORDER BY created_at DESC LIMIT ? OFFSET ?""",
                        (status_value, limit, offset)
                    )
                else:
                    cursor.execute(
                        """SELECT task_id, task_type, status, source_location, source_type, 
                                  metadata, error_message, result_data, created_at, updated_at
                           FROM task_records
                           ORDER BY created_at DESC LIMIT ? OFFSET ?""",
                        (limit, offset)
                    )
                
                rows = cursor.fetchall()
                tasks = []
                
                for row in rows:
                    tasks.append({
                        'task_id': row[0],
                        'task_type': row[1],
                        'status': row[2],
                        'source_location': row[3],
                        'source_type': row[4],
                        'metadata': json.loads(row[5]) if row[5] else {},
                        'error_message': row[6],
                        'result_data': json.loads(row[7]) if row[7] else None,
                        'created_at': row[8],
                        'updated_at': row[9]
                    })
                
                return tasks
                
            except Exception as e:
                logger.error(f"Failed to list tasks: {e}")
                return []
                
        return await asyncio.get_event_loop().run_in_executor(None, _list)