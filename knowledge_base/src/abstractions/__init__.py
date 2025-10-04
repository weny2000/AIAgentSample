"""
Abstract interfaces for RAG pipeline services.
These abstractions allow seamless switching between local and AWS implementations.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union
from pathlib import Path
import asyncio
from enum import Enum
from dataclasses import dataclass


class TaskStatus(Enum):
    """Task processing status enumeration"""
    QUEUED = "queued"
    PROCESSING = "processing"
    PROCESSING_PARSING = "processing_parsing"
    PROCESSING_CHUNKING = "processing_chunking"
    PROCESSING_EMBEDDING = "processing_embedding"
    PROCESSING_INDEXING = "processing_indexing"
    SUCCESS = "success"
    FAILED = "failed"


class SourceType(Enum):
    """Source type enumeration"""
    FILE = "file"
    URL = "url"
    S3 = "s3"


@dataclass
class TagResult:
    """Result of tag extraction process"""
    auto_tags: List[str]
    manual_tags: List[str] = None
    tag_weights: Dict[str, float] = None
    confidence_scores: Dict[str, float] = None
    extraction_metadata: Dict[str, Any] = None


class EmbeddingProvider(ABC):
    """Abstract base class for embedding model providers"""
    
    @abstractmethod
    async def get_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for the given text.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of float values representing the embedding vector
        """
        pass
    
    @abstractmethod
    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embedding vectors for multiple texts in batch.
        
        Args:
            texts: List of input texts to embed
            
        Returns:
            List of embedding vectors
        """
        pass
    
    @abstractmethod
    def get_embedding_dimension(self) -> int:
        """
        Get the dimension of the embedding vectors.
        
        Returns:
            Integer representing vector dimension
        """
        pass


class VectorDatabase(ABC):
    """Abstract base class for vector database providers"""
    
    @abstractmethod
    async def create_index(self, index_name: str, dimension: int, **kwargs) -> bool:
        """
        Create a new vector index.
        
        Args:
            index_name: Name of the index to create
            dimension: Vector dimension
            **kwargs: Additional configuration parameters
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def index_documents(
        self, 
        index_name: str,
        documents: List[Dict[str, Any]]
    ) -> bool:
        """
        Index documents with their vectors and metadata.
        
        Args:
            index_name: Target index name
            documents: List of documents with structure:
                {
                    'id': str,
                    'content': str,
                    'vector': List[float],
                    'metadata': Dict[str, Any]
                }
                
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def search(
        self,
        index_name: str,
        query_vector: List[float],
        top_k: int = 5,
        filter_criteria: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar vectors.
        
        Args:
            index_name: Index to search in
            query_vector: Query vector
            top_k: Number of results to return
            filter_criteria: Optional metadata filters
            
        Returns:
            List of search results with structure:
                {
                    'id': str,
                    'content': str,
                    'score': float,
                    'metadata': Dict[str, Any]
                }
        """
        pass
    
    @abstractmethod
    async def delete_index(self, index_name: str) -> bool:
        """
        Delete an index.
        
        Args:
            index_name: Name of index to delete
            
        Returns:
            True if successful
        """
        pass


class StorageProvider(ABC):
    """Abstract base class for file storage providers"""
    
    @abstractmethod
    async def store_file(
        self,
        file_content: bytes,
        file_path: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a file and return its storage location.
        
        Args:
            file_content: File content as bytes
            file_path: Desired file path/key
            metadata: Optional metadata to attach
            
        Returns:
            Storage location/URI of the stored file
        """
        pass
    
    @abstractmethod
    async def retrieve_file(self, file_path: str) -> bytes:
        """
        Retrieve file content.
        
        Args:
            file_path: Path/key of the file to retrieve
            
        Returns:
            File content as bytes
        """
        pass
    
    @abstractmethod
    async def delete_file(self, file_path: str) -> bool:
        """
        Delete a file.
        
        Args:
            file_path: Path/key of the file to delete
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def list_files(self, prefix: str = "") -> List[str]:
        """
        List files with optional prefix filter.
        
        Args:
            prefix: Optional prefix to filter files
            
        Returns:
            List of file paths/keys
        """
        pass


class TaskQueue(ABC):
    """Abstract base class for async task queue providers"""
    
    @abstractmethod
    async def enqueue_task(
        self,
        task_type: str,
        task_data: Dict[str, Any],
        priority: int = 0
    ) -> str:
        """
        Enqueue a task for processing.
        
        Args:
            task_type: Type of task to execute
            task_data: Task payload data
            priority: Task priority (higher = more priority)
            
        Returns:
            Task ID
        """
        pass
    
    @abstractmethod
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get task status and result.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Task status information or None if not found
        """
        pass


class StateManager(ABC):
    """Abstract base class for task state management"""
    
    @abstractmethod
    async def create_task_record(
        self,
        task_id: str,
        task_type: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Create initial task record.
        
        Args:
            task_id: Unique task identifier
            task_type: Type of task
            source_location: Location of source data
            source_type: Type of source
            metadata: Optional task metadata
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        error_message: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Update task status.
        
        Args:
            task_id: Task identifier
            status: New task status
            error_message: Error message if failed
            result_data: Result data if successful
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get current task status and details.
        
        Args:
            task_id: Task identifier
            
        Returns:
            Task status information or None if not found
        """
        pass
    
    @abstractmethod
    async def list_tasks(
        self,
        status_filter: Optional[TaskStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List tasks with optional filtering.
        
        Args:
            status_filter: Optional status to filter by
            limit: Maximum number of results
            offset: Result offset for pagination
            
        Returns:
            List of task records
        """
        pass


class WorkflowOrchestrator(ABC):
    """Abstract base class for workflow orchestration"""
    
    @abstractmethod
    async def start_ingestion_workflow(
        self,
        task_id: str,
        source_location: str,
        source_type: SourceType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Start document ingestion workflow.
        
        Args:
            task_id: Unique task identifier
            source_location: Location of source data
            source_type: Type of source
            metadata: Optional metadata
            
        Returns:
            True if workflow started successfully
        """
        pass
    
    @abstractmethod
    async def get_workflow_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get workflow execution status.
        
        Args:
            task_id: Task identifier
            
        Returns:
            Workflow status information or None if not found
        """
        pass


class TaggingProvider(ABC):
    """Abstract base class for document tagging and analysis providers"""
    
    @abstractmethod
    async def extract_tags_from_content(
        self,
        content: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> TagResult:
        """
        Extract tags from document content using AI/ML models.
        
        Args:
            content: Document text content
            filename: Optional filename for additional context
            content_type: Optional content type (e.g., 'markdown', 'pdf')
            
        Returns:
            TagResult containing extracted tags and metadata
        """
        pass
    
    @abstractmethod
    async def analyze_query_intent(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None
    ) -> TagResult:
        """
        Analyze user query to extract intent tags and search hints.
        
        Args:
            query: User's search query
            context: Optional context information
            
        Returns:
            TagResult containing query intent tags
        """
        pass
    
    @abstractmethod
    async def suggest_related_tags(
        self,
        existing_tags: List[str],
        domain: Optional[str] = None
    ) -> List[str]:
        """
        Suggest related tags based on existing tags.
        
        Args:
            existing_tags: Current document tags
            domain: Optional domain context (e.g., 'programming', 'science')
            
        Returns:
            List of suggested related tags
        """
        pass


class TagAwareVectorDatabase(VectorDatabase):
    """Extended vector database interface with tag-aware search capabilities"""
    
    @abstractmethod
    async def search_with_tags(
        self,
        index_name: str,
        query_vector: List[float],
        required_tags: Optional[List[str]] = None,
        optional_tags: Optional[List[str]] = None,
        tag_weights: Optional[Dict[str, float]] = None,
        top_k: int = 5,
        filter_criteria: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search with tag-based filtering and weighting.
        
        Args:
            index_name: Index to search in
            query_vector: Query vector
            required_tags: Tags that documents must have
            optional_tags: Tags that boost document scores
            tag_weights: Weights for different tags
            top_k: Number of results to return
            filter_criteria: Additional metadata filters
            
        Returns:
            List of search results with tag relevance scores
        """
        pass
    
    @abstractmethod
    async def get_tag_statistics(
        self,
        index_name: str,
        tag_filter: Optional[List[str]] = None
    ) -> Dict[str, int]:
        """
        Get tag usage statistics from the index.
        
        Args:
            index_name: Index to analyze
            tag_filter: Optional tags to filter statistics
            
        Returns:
            Dictionary mapping tags to document counts
        """
        pass


class EnhancedStateManager(StateManager):
    """Extended state manager with tag storage capabilities"""
    
    @abstractmethod
    async def store_document_tags(
        self,
        document_id: str,
        tag_result: TagResult,
        task_id: Optional[str] = None
    ) -> bool:
        """
        Store document tags and associated metadata.
        
        Args:
            document_id: Document identifier
            tag_result: Tag extraction results
            task_id: Optional associated task ID
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    async def get_document_tags(
        self,
        document_id: str
    ) -> Optional[TagResult]:
        """
        Retrieve stored tags for a document.
        
        Args:
            document_id: Document identifier
            
        Returns:
            TagResult or None if not found
        """
        pass
    
    @abstractmethod
    async def search_documents_by_tags(
        self,
        required_tags: Optional[List[str]] = None,
        optional_tags: Optional[List[str]] = None,
        tag_threshold: float = 0.5,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search documents by tag criteria.
        
        Args:
            required_tags: Tags that documents must have
            optional_tags: Tags that boost document relevance
            tag_threshold: Minimum tag confidence threshold
            limit: Maximum number of results
            
        Returns:
            List of matching documents with tag information
        """
        pass