"""
Document Processing Service - responsible for document vectorization, indexing and processing logic
"""

import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime

from src.core.models import Document, DocumentChunk, KnowledgeChunk
from src.abstractions import (
    EmbeddingProvider, VectorDatabase, StorageProvider, 
    StateManager, TaskStatus, SourceType, TaggingProvider
)
from src.core.processing import DocumentProcessor
from src.core.chunking import TextChunker

logger = logging.getLogger(__name__)


class ProcessingService:
    """Document processing service - responsible for document parsing, vectorization and indexing"""
    
    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_database: VectorDatabase,
        storage_provider: StorageProvider,
        state_manager: StateManager,
        tagging_provider: Optional[TaggingProvider] = None,
        chunk_size: int = 1000,
        chunk_overlap: int = 200
    ):
        self.embedding_provider = embedding_provider
        self.vector_database = vector_database
        self.storage_provider = storage_provider
        self.state_manager = state_manager
        self.tagging_provider = tagging_provider
        
        # Initialize processors
        self.document_processor = DocumentProcessor()
        self.text_chunker = TextChunker(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        
        # Default index name
        self.default_index = "knowledge_base"
    
    async def process_document_async(
        self, 
        document: Document, 
        task_id: str
    ) -> bool:
        """
        Complete asynchronous document processing workflow
        
        Args:
            document: Document object to process
            task_id: Associated task ID
            
        Returns:
            bool: Whether processing was successful
        """
        try:
            # 1. Update task status to processing
            await self._update_task_status(task_id, TaskStatus.PROCESSING, "Starting document processing")
            
            # 2. Automatic tag extraction (if enabled)
            if self.tagging_provider:
                logger.info(f"Starting tag extraction for document {document.id}")
                tag_result = await self.tagging_provider.extract_tags_from_content(
                    content=document.content,
                    filename=document.original_filename,
                    content_type=document.metadata.get('content_type', 'text')
                )
                
                # Update document tag information
                document.auto_tags = tag_result.auto_tags
                document.tag_weights = tag_result.tag_weights or {}
                document.tag_metadata = tag_result.extraction_metadata or {}
                
                logger.info(f"Extracted {len(tag_result.auto_tags)} tags for document {document.id}: {tag_result.auto_tags}")
            
            # 3. Parse document content
            await self._update_task_status(task_id, TaskStatus.PROCESSING_PARSING, "Parsing document content")
            parsed_content = await self._parse_document_content(document)
            
            # 4. Text chunking
            await self._update_task_status(task_id, TaskStatus.PROCESSING_CHUNKING, "Splitting text chunks")
            chunks = await self._chunk_document(document, parsed_content)
            
            # 5. Generate vector embeddings
            await self._update_task_status(task_id, TaskStatus.PROCESSING_EMBEDDING, "Generating vector embeddings")
            knowledge_chunks = await self._generate_embeddings(chunks)
            
            # 6. Index to vector database
            await self._update_task_status(task_id, TaskStatus.PROCESSING_INDEXING, "Creating vector index")
            await self._index_knowledge_chunks(knowledge_chunks)
            
            logger.info(f"About to store document record for {document.id}")
            
            # 7. Store document record to documents table
            await self._store_document_record(document, knowledge_chunks)
            
            # 8. Complete processing
            result_data = {
                "document_id": document.id,
                "chunks_created": len(knowledge_chunks),
                "index_name": self.default_index,
                "auto_tags": document.auto_tags,
                "tag_count": len(document.auto_tags),
                "processing_completed_at": datetime.now().isoformat()
            }
            
            await self._update_task_status(
                task_id, 
                TaskStatus.SUCCESS, 
                f"Document processing completed, generated {len(knowledge_chunks)} knowledge chunks",
                result_data
            )
            
            logger.info(f"Document {document.id} processed successfully: {len(knowledge_chunks)} chunks indexed")
            return True
            
        except Exception as e:
            # Processing failed, update status
            error_msg = f"Document processing failed: {str(e)}"
            await self._update_task_status(task_id, TaskStatus.FAILED, error_msg)
            logger.error(f"Document processing failed for {document.id}: {e}")
            return False
    
    async def _parse_document_content(self, document: Document) -> str:
        """Parse document content"""
        try:
            # If text content already exists, use it directly
            if document.content and document.content.strip():
                return document.content
            
            # If it's a file, read from storage and parse
            if document.metadata.get("file_path"):
                file_path = document.metadata["file_path"]
                content_bytes = await self.storage_provider.retrieve_file(file_path)
                
                # Parse content based on file type
                content_type = document.metadata.get("content_type", "")
                
                if content_type.startswith("text/"):
                    return content_bytes.decode('utf-8')
                elif content_type == "application/json":
                    return content_bytes.decode('utf-8')
                else:
                    # For other file types, use document processor
                    return await self.document_processor.extract_text(
                        content_bytes, 
                        content_type,
                        document.original_filename
                    )
            else:
                raise ValueError("No content or file path available for document")
                
        except Exception as e:
            logger.error(f"Failed to parse document content: {e}")
            raise
    
    async def _chunk_document(self, document: Document, content: str) -> List[DocumentChunk]:
        """Split document content into chunks"""
        try:
            # Use text chunker
            text_chunks = await self.text_chunker.chunk_text(content)
            
            # Create DocumentChunk objects
            chunks = []
            for i, chunk_text in enumerate(text_chunks):
                chunk = DocumentChunk(
                    id=f"{document.id}_chunk_{i}",
                    source_document_id=document.id,  # Correct field name
                    content=chunk_text,
                    chunk_index=i,
                    chunk_size=len(chunk_text),      # Add missing field
                    metadata={
                        "document_title": document.title,
                        "source_type": document.source_type.value,
                        "original_filename": document.original_filename,
                        "auto_tags": document.auto_tags,  # Add automatically extracted tags
                        "manual_tags": document.tags,     # Add manual tags
                        "tag_weights": document.tag_weights,  # Add tag weights
                        **document.metadata
                    }
                )
                chunks.append(chunk)
            
            logger.info(f"Document {document.id} chunked into {len(chunks)} pieces")
            return chunks
            
        except Exception as e:
            logger.error(f"Failed to chunk document: {e}")
            raise
    
    async def _generate_embeddings(self, chunks: List[DocumentChunk]) -> List[KnowledgeChunk]:
        """Generate vector embeddings for document chunks"""
        try:
            # Extract all text content
            texts = [chunk.content for chunk in chunks]
            
            # Generate embeddings in batches
            embeddings = await self.embedding_provider.get_embeddings_batch(texts)
            
            # Create KnowledgeChunk objects
            knowledge_chunks = []
            for chunk, embedding in zip(chunks, embeddings):
                knowledge_chunk = KnowledgeChunk(
                    id=chunk.id,
                    source_document_id=chunk.source_document_id,  # Correct field name
                    content=chunk.content,
                    embedding_vector=embedding,                   # Correct field name
                    chunk_index=chunk.chunk_index,
                    metadata=chunk.metadata
                )
                knowledge_chunks.append(knowledge_chunk)
            
            logger.info(f"Generated embeddings for {len(knowledge_chunks)} chunks")
            return knowledge_chunks
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            raise
    
    async def _index_knowledge_chunks(self, knowledge_chunks: List[KnowledgeChunk]) -> None:
        """Index knowledge chunks to vector database"""
        try:
            # Ensure index exists
            if knowledge_chunks:
                embedding_dim = len(knowledge_chunks[0].embedding_vector)  # Correct field name
                await self.vector_database.create_index(self.default_index, embedding_dim)
            
            # Prepare index data
            documents = []
            for chunk in knowledge_chunks:
                doc_data = {
                    'id': chunk.id,
                    'content': chunk.content,
                    'vector': chunk.embedding_vector,  # Correct field name
                    'metadata': {
                        **chunk.metadata,
                        'document_id': chunk.source_document_id,  # Correct field name
                        'chunk_index': chunk.chunk_index
                    }
                }
                documents.append(doc_data)
            
            # Batch index
            success = await self.vector_database.index_documents(self.default_index, documents)
            
            if not success:
                raise Exception("Vector database indexing failed")
            
            logger.info(f"Successfully indexed {len(knowledge_chunks)} chunks to vector database")
            
        except Exception as e:
            logger.error(f"Failed to index knowledge chunks: {e}")
            raise
    
    async def _store_document_record(self, document: Document, knowledge_chunks: List[KnowledgeChunk]) -> None:
        """Store document record to documents table"""
        try:
            logger.info(f"Attempting to store document record for {document.id}")
            
            # Check if state_manager has store_document_record method
            if hasattr(self.state_manager, 'store_document_record'):
                logger.info(f"StateManager has store_document_record method")
                
                # Prepare document record data
                chunk_ids = [chunk.id for chunk in knowledge_chunks]
                file_paths = [document.metadata.get("file_path")] if document.metadata.get("file_path") else []
                
                logger.info(f"Storing document: id={document.id}, chunks={len(chunk_ids)}, file_paths={file_paths}")
                
                await self.state_manager.store_document_record(
                    document_id=document.id,
                    title=document.title,
                    source_location=document.source_location,
                    source_type=document.source_type,  # Pass SourceType object directly
                    metadata={
                        "original_filename": document.original_filename,
                        "content_type": document.metadata.get("content_type"),
                        "auto_tags": ",".join(document.auto_tags) if document.auto_tags else "",
                        "manual_tags": ",".join(document.tags) if document.tags else "",
                        "tag_weights": str(document.tag_weights) if document.tag_weights else "{}",
                        "upload_method": document.metadata.get("upload_method", "api_upload"),
                        "file_size": document.metadata.get("file_size"),
                        **document.metadata
                    },
                    chunk_ids=chunk_ids,
                    file_paths=file_paths
                )
                logger.info(f"Document record stored successfully for {document.id}")
            else:
                logger.warning("StateManager does not support document record storage")
                
        except Exception as e:
            logger.error(f"Failed to store document record for {document.id}: {e}")
            # Don't throw exception as this shouldn't affect the main processing flow
    
    async def _update_task_status(
        self, 
        task_id: str, 
        status: TaskStatus, 
        message: str,
        result_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update task status"""
        try:
            success = await self.state_manager.update_task_status(
                task_id=task_id,
                status=status,
                error_message=message if status == TaskStatus.FAILED else None,
                result_data=result_data
            )
            
            if not success:
                logger.warning(f"Failed to update task status for {task_id}")
            else:
                logger.debug(f"Task {task_id} status updated to {status.value}: {message}")
                
        except Exception as e:
            logger.error(f"Error updating task status: {e}")
    
    async def get_processing_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        try:
            # Various statistics can be added here
            return {
                "service_status": "active",
                "default_index": self.default_index,
                "embedding_provider": type(self.embedding_provider).__name__,
                "vector_database": type(self.vector_database).__name__
            }
        except Exception as e:
            logger.error(f"Failed to get processing stats: {e}")
            return {"service_status": "error", "error": str(e)}