# SQLModel Base classes and utilities with proper audit field handling

from sqlmodel import SQLModel, Field, Session
from datetime import datetime, timezone
from typing import Optional, Any
from contextlib import contextmanager
import uuid
import contextvars

# Context variable to track current user for audit fields
current_user_id: contextvars.ContextVar[Optional[uuid.UUID]] = contextvars.ContextVar('current_user_id', default=None)


class AuditMixin:
    """Mixin class for audit field management"""
    
    @classmethod
    def get_current_user_id(cls) -> uuid.UUID:
        """Get current user ID from context"""
        user_id = current_user_id.get()
        if user_id is None:
            raise ValueError("No current user set in context. Use set_audit_user() before database operations.")
        return user_id
    
    def set_audit_fields_for_create(self):
        """Set audit fields for record creation"""
        current_time = datetime.now(timezone.utc)
        user_id = self.get_current_user_id()
        
        self.created_at = current_time
        self.updated_at = current_time
        self.created_by = user_id
        self.updated_by = user_id
    
    def set_audit_fields_for_update(self):
        """Set audit fields for record update"""
        current_time = datetime.now(timezone.utc)
        user_id = self.get_current_user_id()
        
        self.updated_at = current_time
        self.updated_by = user_id


class BaseTable(SQLModel, AuditMixin):
    """
    Base class for all database models with comprehensive audit fields
    
    Provides:
    - UUID primary key with automatic generation
    - Created/updated timestamps (automatically managed)
    - User audit tracking (created_by/updated_by)
    - Audit field management methods
    
    Usage:
        # Set current user context
        with audit_context(user_id):
            user = User(username="test", email="test@example.com")
            user.set_audit_fields_for_create()
            session.add(user)
            session.commit()
    """
    
    # Primary key with UUID for better distribution and security
    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4, 
        primary_key=True,
        description="Unique identifier for the record"
    )
    
    # Audit timestamps - NO default_factory, managed manually for proper control
    created_at: Optional[datetime] = Field(
        default=None,
        description="When the record was created (UTC)"
    )
    
    updated_at: Optional[datetime] = Field(
        default=None,
        description="When the record was last updated (UTC)"
    )
    
    # User audit tracking - NO defaults, managed through context
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        description="ID of the user who created this record"
    )
    
    updated_by: Optional[uuid.UUID] = Field(
        default=None,
        description="ID of the user who last updated this record"
    )
    
    def __repr__(self) -> str:
        """String representation of the model"""
        return f"<{self.__class__.__name__}(id={self.id})>"


# Context manager for setting current user
@contextmanager
def audit_context(user_id: uuid.UUID):
    """
    Context manager to set current user for audit fields
    
    Usage:
        with audit_context(current_user.id):
            # All database operations will use this user_id for audit fields
            user = User(username="test")
            user.set_audit_fields_for_create()
            session.add(user)
            session.commit()
    """
    token = current_user_id.set(user_id)
    try:
        yield
    finally:
        current_user_id.reset(token)


def set_audit_user(user_id: uuid.UUID):
    """Set current user ID for audit fields (alternative to context manager)"""
    current_user_id.set(user_id)


def get_current_audit_user() -> Optional[uuid.UUID]:
    """Get current audit user ID"""
    return current_user_id.get()