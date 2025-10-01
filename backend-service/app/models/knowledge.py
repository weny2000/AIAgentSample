# Knowledge sources and version management models
# Based on architecture design section 5: Data & Storage

from sqlmodel import Field, Relationship
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
import uuid
from app.database.base import BaseTable


class SourceType(str, Enum):
    """Types of knowledge sources"""
    USER_UPLOAD = "USER_UPLOAD"      # User uploaded files
    EXTERNAL_SYNC = "EXTERNAL_SYNC"  # Externally synchronized content


class SourceStatus(str, Enum):
    """Status of knowledge source versions"""
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    DEPRECATED = "DEPRECATED"
    DELETED = "DELETED"


class KnowledgeSource(BaseTable, table=True):
    """
    Knowledge Sources (Logical)
    Represents a logical knowledge source that can have multiple versions
    """
    __tablename__ = "knowledge_sources"
    
    title: str = Field(max_length=500, description="Knowledge source title")
    description: Optional[str] = Field(default=None, max_length=2000, description="Description of the knowledge source")
    
    # Source metadata
    source_type: SourceType = Field(description="Type of knowledge source")
    original_filename: Optional[str] = Field(default=None, max_length=255, description="Original filename for uploads")
    
    # Author/creator information
    author: Optional[str] = Field(default=None, max_length=200, description="Original author")
    creator_user_id: uuid.UUID = Field(description="User who created this knowledge source")
    
    # Content metadata
    language: Optional[str] = Field(default=None, max_length=10, description="Content language (ISO code)")
    tags: Optional[str] = Field(default=None, description="Tags for categorization (JSON string)")
    
    # Status
    is_active: bool = Field(default=True, description="Whether source is active")
    
    # Relationships
    versions: List["SourceVersion"] = Relationship(back_populates="knowledge_source")
    chunks: List["KnowledgeChunk"] = Relationship(back_populates="knowledge_source")


class SourceVersion(BaseTable, table=True):
    """
    Knowledge Source Versions
    Each version represents a specific state of a knowledge source
    """
    __tablename__ = "source_versions"
    
    # Parent source
    logical_source_id: uuid.UUID = Field(foreign_key="knowledge_sources.id", description="Parent knowledge source")
    knowledge_source: KnowledgeSource = Relationship(back_populates="versions")
    
    # Version information
    version_number: str = Field(max_length=50, description="Version identifier (e.g., v1.0, 1.2.3)")
    is_latest: bool = Field(default=False, description="Whether this is the latest version")
    
    # Storage information
    object_storage_key: str = Field(max_length=500, description="Key/path in object storage")
    file_size: Optional[int] = Field(default=None, description="File size in bytes")
    content_hash: str = Field(max_length=128, description="Hash of file content for integrity")
    mime_type: Optional[str] = Field(default=None, max_length=100, description="MIME type of the file")
    
    # Processing status
    status: SourceStatus = Field(default=SourceStatus.DRAFT, description="Version status")
    processing_status: Optional[str] = Field(default=None, max_length=50, description="Processing pipeline status")
    
    # Version metadata
    change_notes: Optional[str] = Field(default=None, max_length=1000, description="Notes about changes in this version")
    approved_by: Optional[uuid.UUID] = Field(default=None, description="User who approved this version")
    approved_at: Optional[datetime] = Field(default=None, description="When version was approved")
    
    # Relationships
    chunks: List["KnowledgeChunk"] = Relationship(back_populates="source_version")


class SyncSnapshot(BaseTable, table=True):
    """
    Sync Snapshots
    For externally synchronized sources (e.g., SharePoint, Confluence)
    """
    __tablename__ = "sync_snapshots"
    
    # External source information
    external_source_url: str = Field(max_length=1000, description="URL of external source")
    external_source_id: Optional[str] = Field(default=None, max_length=255, description="External system's ID")
    
    # Snapshot information
    snapshot_timestamp: datetime = Field(description="When snapshot was taken")
    content_hash: str = Field(max_length=128, description="Hash of content for change detection")
    
    # Storage information
    object_storage_key: str = Field(max_length=500, description="Key/path in object storage")
    file_size: Optional[int] = Field(default=None, description="Content size in bytes")
    
    # Sync metadata
    sync_metadata: Optional[str] = Field(default=None, description="Additional sync information (JSON string)")
    
    # Processing status
    status: SourceStatus = Field(default=SourceStatus.DRAFT, description="Snapshot status")
    processing_status: Optional[str] = Field(default=None, max_length=50, description="Processing pipeline status")
    
    # Relationships
    chunks: List["KnowledgeChunk"] = Relationship(back_populates="sync_snapshot")


class KnowledgeSet(BaseTable, table=True):
    """
    Knowledge Sets
    Curated collections of specific knowledge versions
    """
    __tablename__ = "knowledge_sets"
    
    name: str = Field(max_length=200, description="Knowledge set name")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description of the knowledge set")
    
    # Creator and sharing
    creator_user_id: uuid.UUID = Field(description="User who created this knowledge set")
    sharing_level: str = Field(max_length=50, default="PRIVATE", description="Sharing level (PRIVATE, TEAM, PUBLIC)")
    
    # Version references (JSON strings)
    source_version_ids: Optional[str] = Field(default="[]", description="JSON array of source version IDs")
    snapshot_ids: Optional[str] = Field(default="[]", description="JSON array of sync snapshot IDs")
    
    # Metadata
    tags: Optional[str] = Field(default=None, description="Tags for categorization (JSON string)")
    is_active: bool = Field(default=True, description="Whether knowledge set is active")


class KnowledgeChunk(BaseTable, table=True):
    """
    Knowledge Chunks
    Text chunks extracted from knowledge sources with metadata
    """
    __tablename__ = "knowledge_chunks"
    
    # Source references (one of these will be set)
    logical_source_id: Optional[uuid.UUID] = Field(default=None, foreign_key="knowledge_sources.id", description="Parent knowledge source")
    source_version_id: Optional[uuid.UUID] = Field(default=None, foreign_key="source_versions.id", description="Specific source version")
    sync_snapshot_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sync_snapshots.id", description="Sync snapshot")
    
    # Content
    content: str = Field(description="Text content of the chunk")
    content_hash: str = Field(max_length=128, description="Hash of content")
    
    # Position and metadata
    chunk_index: int = Field(description="Order of chunk within source")
    chunk_size: int = Field(description="Size of chunk in characters")
    
    # Vector embeddings (stored as JSON string for flexibility)
    embedding_vector: Optional[str] = Field(default=None, description="Vector embedding (JSON string)")
    embedding_model: Optional[str] = Field(default=None, max_length=100, description="Model used for embedding")
    
    # Additional metadata
    page_number: Optional[int] = Field(default=None, description="Page number if applicable")
    section_title: Optional[str] = Field(default=None, max_length=500, description="Section title if available")
    
    # Relationships
    knowledge_source: Optional[KnowledgeSource] = Relationship(back_populates="chunks")
    source_version: Optional[SourceVersion] = Relationship(back_populates="chunks")
    sync_snapshot: Optional[SyncSnapshot] = Relationship(back_populates="chunks")


# Update forward references
KnowledgeSource.model_rebuild()
SourceVersion.model_rebuild()
SyncSnapshot.model_rebuild()
KnowledgeSet.model_rebuild()
KnowledgeChunk.model_rebuild()
