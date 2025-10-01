"""
Storage directory models
"""

from sqlmodel import Field, Relationship
from typing import Optional, Literal
from enum import Enum
import uuid
from app.database.base import BaseTable


class DirectoryType(str, Enum):
    """Directory owner type"""
    ORGANIZATION = "ORGANIZATION"
    USER = "USER"


class StorageDirectory(BaseTable, table=True):
    """
    Storage directory for organizations and users
    Each organization and user can have only one root directory
    """
    __tablename__ = "storage_directories"
    
    # Directory metadata
    name: str = Field(max_length=200, description="Directory name")
    description: Optional[str] = Field(default=None, max_length=1000, description="Directory description")
    
    # Owner information
    owner_type: DirectoryType = Field(description="Type of owner (organization or user)")
    owner_id: uuid.UUID = Field(description="ID of the owner (team_id or user_id)")
    
    # Directory path and structure
    root_path: str = Field(max_length=500, description="Root directory path")
    
    # Directory status
    is_active: bool = Field(default=True, description="Whether directory is active")
    
    # Storage metadata
    max_size_bytes: Optional[int] = Field(default=None, description="Maximum storage size in bytes")
    current_size_bytes: int = Field(default=0, description="Current storage usage in bytes")
    
    def __str__(self) -> str:
        return f"{self.name} ({self.owner_type}: {self.owner_id})"


# Update forward references
StorageDirectory.model_rebuild()