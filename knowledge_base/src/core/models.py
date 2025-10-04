"""
Core data models for the RAG pipeline.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from enum import Enum

from src.abstractions import TaskStatus, SourceType, TagResult


class DocumentChunk(BaseModel):
    """Represents a chunk of a processed document"""
    id: str
    content: str
    chunk_index: int
    chunk_size: int
    source_document_id: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Document(BaseModel):
    """Represents a source document"""
    id: str
    title: str
    content: str
    source_type: SourceType
    source_location: str
    original_filename: Optional[str] = None
    author: Optional[str] = None
    language: Optional[str] = None
    tags: List[str] = Field(default_factory=list)  # Legacy manual tags
    auto_tags: List[str] = Field(default_factory=list)  # AI-generated tags
    tag_weights: Dict[str, float] = Field(default_factory=dict)  # Tag confidence scores
    tag_metadata: Dict[str, Any] = Field(default_factory=dict)  # Tag extraction metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class KnowledgeChunk(BaseModel):
    """Represents a vectorized knowledge chunk ready for indexing"""
    id: str
    content: str
    embedding_vector: List[float]
    source_document_id: str
    chunk_index: int
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class IngestionTask(BaseModel):
    """Represents a document ingestion task"""
    task_id: str
    source_type: SourceType
    source_location: str
    status: TaskStatus = TaskStatus.QUEUED
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    result_data: Optional[Dict[str, Any]] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SearchResult(BaseModel):
    """Represents a search result from vector database"""
    content: str
    score: float
    source: Dict[str, Any]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class QueryRequest(BaseModel):
    """Request model for knowledge queries"""
    query: str
    top_k: int = Field(default=5, ge=1, le=100)
    filters: Optional[Dict[str, Any]] = None
    required_tags: Optional[List[str]] = None  # Tags that results must have
    optional_tags: Optional[List[str]] = None  # Tags that boost relevance
    tag_weights: Optional[Dict[str, float]] = None  # Custom tag weights
    use_tag_aware_search: bool = True  # Enable tag-aware search
    include_metadata: bool = True


class QueryResponse(BaseModel):
    """Response model for knowledge queries"""
    query: str
    results: List[SearchResult]
    total_results: int
    processing_time_ms: int
    query_tags: Optional[List[str]] = None  # Tags extracted from query
    search_strategy: Optional[str] = None  # Which search strategy was used
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class IngestionRequest(BaseModel):
    """Request model for document ingestion"""
    source_type: SourceType
    title: Optional[str] = None
    author: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # For URL ingestion
    url: Optional[str] = None
    
    # For file ingestion (handled separately in multipart form)
    # file content will be handled by FastAPI's UploadFile


class IngestionResponse(BaseModel):
    """Response model for document ingestion"""
    task_id: str
    status: TaskStatus
    message: str
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TaskStatusResponse(BaseModel):
    """Response model for task status queries"""
    task_id: str
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }