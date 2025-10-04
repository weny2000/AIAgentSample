"""
Workflow orchestration for RAG pipeline processing.
Handles the end-to-end processing of documents from ingestion to indexing.
"""

import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging

from src.abstractions import (
    EmbeddingProvider, VectorDatabase, StorageProvider, 
    StateManager, TaskStatus, SourceType, WorkflowOrchestrator
)
from .models import Document, DocumentChunk, KnowledgeChunk, IngestionTask
from .processing import DocumentProcessor, TextChunker

logger = logging.getLogger(__name__)


class LocalWorkflowOrchestrator(WorkflowOrchestrator):
    """
    Local implementation of workflow orchestration.
    Processes tasks sequentially in the same process.
    """
    
    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_database: VectorDatabase,
        storage_provider: StorageProvider,
        state_manager: StateManager,
        max_concurrent_tasks: int = 4,
        chunk_size: int = 1000,
        chunk_overlap: int = 200
    ):
        self.embedding_provider = embedding_provider
        self.vector_database = vector_database
        self.storage_provider = storage_provider
        self.state_manager = state_manager
        self.max_concurrent_tasks = max_concurrent_tasks
        
        # Initialize processors
        self.document_processor = DocumentProcessor()
        self.text_chunker = TextChunker(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        
        # Track running tasks
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent_tasks)
    
    async def start_ingestion_workflow(
        self,
        task_id: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Start document ingestion workflow"""
        try:
            # Create task record
            await self.state_manager.create_task_record(
                task_id=task_id,
                task_type="ingestion",
                source_location=source_location,
                source_type=source_type,
                metadata=metadata
            )
            
            # Start workflow in background
            task = asyncio.create_task(
                self._run_ingestion_workflow(task_id, source_location, source_type, metadata)
            )
            self._running_tasks[task_id] = task
            
            # Remove from running tasks when done
            task.add_done_callback(lambda t: self._running_tasks.pop(task_id, None))
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start workflow for task {task_id}: {e}")
            await self.state_manager.update_task_status(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error_message=str(e)
            )
            return False
    
    async def get_workflow_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get workflow execution status"""
        return await self.state_manager.get_task_status(task_id)
    
    async def _run_ingestion_workflow(
        self,
        task_id: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Run the complete ingestion workflow"""
        async with self._semaphore:
            try:
                logger.info(f"Starting ingestion workflow for task {task_id}")
                
                # Step 1: Update status to processing
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING
                )
                
                # Step 2: Parse document content
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING_PARSING
                )
                
                document = await self._parse_document(source_location, source_type, metadata)
                
                # Step 3: Store original document
                stored_location = await self.storage_provider.store_file(
                    file_content=document.content.encode('utf-8'),
                    file_path=f"documents/{task_id}/{document.original_filename or 'content.txt'}",
                    metadata={
                        "task_id": task_id,
                        "document_id": document.id,
                        "source_type": source_type.value,
                        **document.metadata
                    }
                )
                
                # Step 4: Chunk document
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING_CHUNKING
                )
                
                chunks = self.text_chunker.chunk_document(document)
                logger.info(f"Created {len(chunks)} chunks for task {task_id}")
                
                # Step 5: Generate embeddings
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING_EMBEDDING
                )
                
                knowledge_chunks = await self._generate_embeddings(chunks)
                
                # Step 6: Index in vector database
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING_INDEXING
                )
                
                await self._index_knowledge_chunks(knowledge_chunks)
                
                # Step 7: Mark as completed
                result_data = {
                    "document_id": document.id,
                    "stored_location": stored_location,
                    "chunks_created": len(chunks),
                    "chunks_indexed": len(knowledge_chunks)
                }
                
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.SUCCESS,
                    result_data=result_data
                )
                
                logger.info(f"Successfully completed ingestion workflow for task {task_id}")
                
            except Exception as e:
                logger.error(f"Workflow failed for task {task_id}: {e}")
                await self.state_manager.update_task_status(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    error_message=str(e)
                )
                raise
    
    async def _parse_document(
        self,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """Parse document from source location"""
        if source_type == SourceType.FILE:
            # For file type, source_location should be a temporary file path
            # In practice, this would be handled by the API layer
            if Path(source_location).exists():
                with open(source_location, 'rb') as f:
                    file_content = f.read()
                filename = Path(source_location).name
                return await self.document_processor.process_file(
                    file_content=file_content,
                    filename=filename,
                    metadata=metadata
                )
            else:
                raise ValueError(f"File not found: {source_location}")
        
        elif source_type == SourceType.URL:
            return await self.document_processor.process_url(
                url=source_location,
                metadata=metadata
            )
        
        elif source_type == SourceType.S3:
            # For S3, retrieve file content first
            file_content = await self.storage_provider.retrieve_file(source_location)
            filename = Path(source_location).name
            return await self.document_processor.process_file(
                file_content=file_content,
                filename=filename,
                metadata=metadata
            )
        
        else:
            raise ValueError(f"Unsupported source type: {source_type}")
    
    async def _generate_embeddings(self, chunks: List[DocumentChunk]) -> List[KnowledgeChunk]:
        """Generate embeddings for document chunks"""
        knowledge_chunks = []
        
        # Process chunks in batches for efficiency
        batch_size = 32
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            
            # Extract texts for batch processing
            texts = [chunk.content for chunk in batch]
            
            try:
                # Generate embeddings for batch
                embeddings = await self.embedding_provider.get_embeddings_batch(texts)
                
                # Create KnowledgeChunk objects
                for chunk, embedding in zip(batch, embeddings):
                    knowledge_chunk = KnowledgeChunk(
                        id=chunk.id,
                        content=chunk.content,
                        embedding_vector=embedding,
                        source_document_id=chunk.source_document_id,
                        chunk_index=chunk.chunk_index,
                        metadata=chunk.metadata
                    )
                    knowledge_chunks.append(knowledge_chunk)
                
            except Exception as e:
                logger.error(f"Failed to generate embeddings for batch {i//batch_size + 1}: {e}")
                raise
        
        return knowledge_chunks
    
    async def _index_knowledge_chunks(self, knowledge_chunks: List[KnowledgeChunk]) -> None:
        """Index knowledge chunks in vector database"""
        if not knowledge_chunks:
            return
        
        # Prepare documents for indexing
        documents = []
        for chunk in knowledge_chunks:
            doc = {
                'id': chunk.id,
                'content': chunk.content,
                'vector': chunk.embedding_vector,
                'metadata': {
                    'source_document_id': chunk.source_document_id,
                    'chunk_index': chunk.chunk_index,
                    **chunk.metadata
                }
            }
            documents.append(doc)
        
        # Index documents
        success = await self.vector_database.index_documents(
            index_name="knowledge_base",  # TODO: make configurable
            documents=documents
        )
        
        if not success:
            raise Exception("Failed to index documents in vector database")
    
    async def cleanup_task(self, task_id: str) -> None:
        """Clean up resources for a task"""
        task = self._running_tasks.get(task_id)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            finally:
                self._running_tasks.pop(task_id, None)
    
    async def get_running_tasks(self) -> List[str]:
        """Get list of currently running task IDs"""
        return list(self._running_tasks.keys())
    
    async def shutdown(self) -> None:
        """Shutdown orchestrator and cleanup resources"""
        # Cancel all running tasks
        for task_id in list(self._running_tasks.keys()):
            await self.cleanup_task(task_id)
        
        logger.info("Workflow orchestrator shutdown completed")