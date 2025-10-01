# Access control and permissions models
# Based on architecture design section 5: Data & Storage

from sqlmodel import Field, Relationship
from typing import Optional, List, Literal
from enum import Enum
from datetime import datetime
import uuid
from app.database.base import BaseTable


class ResourceType(str, Enum):
    """Types of resources that can have permissions"""
    KNOWLEDGE_SOURCE = "KNOWLEDGE_SOURCE"
    KNOWLEDGE_SET = "KNOWLEDGE_SET"
    TRAINING_PLAN = "TRAINING_PLAN"
    QUESTION = "QUESTION"


class PrincipalType(str, Enum):
    """Types of principals that can have permissions"""
    USER = "USER"
    GROUP = "GROUP"


class PermissionLevel(str, Enum):
    """Permission levels - hierarchical"""
    VIEWER = "VIEWER"      # Can view/read
    EDITOR = "EDITOR"      # Can view + edit
    OWNER = "OWNER"        # Can view + edit + manage permissions


class PermissionAction(str, Enum):
    """Permission audit actions"""
    GRANT = "GRANT"
    REVOKE = "REVOKE"


class AccessControl(BaseTable, table=True):
    """
    Access Control
    Central permission management table
    """
    __tablename__ = "access_control"
    
    # Resource being protected
    resource_id: uuid.UUID = Field(description="ID of the protected resource")
    resource_type: ResourceType = Field(description="Type of the protected resource")
    
    # Principal (user or group) receiving permission
    principal_id: uuid.UUID = Field(description="ID of user or group receiving permission")
    principal_type: PrincipalType = Field(description="Whether principal is user or group")
    
    # Permission level
    permission_level: PermissionLevel = Field(description="Level of permission granted")
    
    # Additional metadata
    granted_by: uuid.UUID = Field(description="User ID who granted this permission")
    granted_at: datetime = Field(description="When permission was granted")
    
    # Optional expiration
    expires_at: Optional[datetime] = Field(default=None, description="When permission expires")
    
    # Status
    is_active: bool = Field(default=True, description="Whether permission is currently active")
    
    # Composite indexes for efficient queries
    # Note: These would be defined in SQLAlchemy as Index objects, 
    # but SQLModel handles basic indexing through Field(index=True)
    
    def __str__(self) -> str:
        return f"{self.principal_type}:{self.principal_id} -> {self.permission_level} on {self.resource_type}:{self.resource_id}"


class PermissionAuditLog(BaseTable, table=True):
    """
    Permission audit log
    Tracks all permission changes for compliance and debugging
    """
    __tablename__ = "permission_audit_logs"
    
    # When the action occurred
    timestamp: datetime = Field(description="When the permission change occurred")
    
    # Who performed the action
    actor_user_id: uuid.UUID = Field(description="User who performed the permission change")
    
    # What action was taken
    action: PermissionAction = Field(description="Type of permission change")
    
    # What resource was affected
    resource_id: uuid.UUID = Field(description="ID of the affected resource")
    resource_type: ResourceType = Field(description="Type of the affected resource")
    
    # Who was affected
    principal_id: uuid.UUID = Field(description="ID of user or group affected")
    principal_type: PrincipalType = Field(description="Whether affected principal is user or group")
    
    # What permission was changed
    permission_level: PermissionLevel = Field(description="Permission level that was granted/revoked")
    
    # Additional context
    reason: Optional[str] = Field(default=None, max_length=500, description="Reason for the change")
    
    def __str__(self) -> str:
        return f"{self.action} {self.permission_level} for {self.principal_type}:{self.principal_id} on {self.resource_type}:{self.resource_id} by {self.actor_user_id}"