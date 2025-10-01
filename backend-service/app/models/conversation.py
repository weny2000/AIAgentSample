# Conversation and interaction models
# Based on architecture design section 5: Data & Storage

from sqlmodel import Field, Relationship
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from datetime import datetime
import uuid
from app.database.base import BaseTable


class MessageSender(str, Enum):
    """Message sender types"""
    USER = "USER"
    AI = "AI"


class ConversationStatus(str, Enum):
    """Conversation status"""
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    DELETED = "DELETED"


class ConversationHistory(BaseTable, table=True):
    """
    Conversation History
    Tracks user conversations with AI Agent for "free exploration" mode
    """
    __tablename__ = "conversation_history"
    
    # User reference
    user_id: uuid.UUID = Field(foreign_key="users.id", description="User who owns this conversation")
    
    # Conversation metadata
    title: str = Field(max_length=500, description="Conversation title (auto-generated or user-defined)")
    start_time: datetime = Field(description="When conversation started")
    last_activity_time: datetime = Field(description="Last message timestamp")
    
    # Context and settings
    context_data: Optional[str] = Field(
        default=None, 
        description="Conversation context (knowledge sets, filters, etc.) - JSON string"
    )
    
    # Status
    status: ConversationStatus = Field(default=ConversationStatus.ACTIVE, description="Conversation status")
    
    # Statistics
    message_count: int = Field(default=0, description="Total number of messages")
    
    # Relationships
    user: "User" = Relationship(back_populates="conversations")
    messages: List["ConversationMessage"] = Relationship(back_populates="conversation")


class ConversationMessage(BaseTable, table=True):
    """
    Conversation Messages
    Individual messages within a conversation
    """
    __tablename__ = "conversation_messages"
    
    # Parent conversation
    conversation_id: uuid.UUID = Field(foreign_key="conversation_history.id", description="Parent conversation")
    conversation: ConversationHistory = Relationship(back_populates="messages")
    
    # Message content
    sender: MessageSender = Field(description="Who sent the message")
    content: str = Field(description="Message content")
    timestamp: datetime = Field(description="When message was sent")
    
    # AI-specific fields
    source_citations: Optional[str] = Field(
        default=None, 
        description="Source citations for AI responses (document IDs, chunk IDs, etc.) - JSON string"
    )
    
    # Message metadata
    token_count: Optional[int] = Field(default=None, description="Token count for AI messages")
    model_used: Optional[str] = Field(default=None, max_length=100, description="AI model used for response")
    processing_time_ms: Optional[int] = Field(default=None, description="Processing time in milliseconds")
    
    # Message status and flags
    is_system_message: bool = Field(default=False, description="Whether this is a system message")
    is_edited: bool = Field(default=False, description="Whether message was edited")
    
    # Additional context
    message_metadata: Optional[str] = Field(
        default=None, 
        description="Additional message metadata - JSON string"
    )


class UserFeedback(BaseTable, table=True):
    """
    User Feedback
    Captures user feedback on AI responses and system interactions
    """
    __tablename__ = "user_feedback"
    
    # User and target
    user_id: uuid.UUID = Field(foreign_key="users.id", description="User providing feedback")
    
    # What the feedback is about (flexible reference)
    target_type: str = Field(max_length=50, description="Type of target (MESSAGE, ANSWER, TRAINING, etc.)")
    target_id: uuid.UUID = Field(description="ID of the target being rated")
    
    # Feedback content
    rating: Optional[int] = Field(default=None, description="Numeric rating (1-5 scale)")
    feedback_text: Optional[str] = Field(default=None, max_length=2000, description="Textual feedback")
    
    # Feedback metadata
    feedback_type: str = Field(max_length=50, description="Type of feedback (ACCURACY, HELPFULNESS, etc.)")
    is_positive: Optional[bool] = Field(default=None, description="Whether feedback is positive")
    
    # Context
    context_data: Optional[str] = Field(
        default=None, 
        description="Additional context for feedback - JSON string"
    )
    
    def __str__(self) -> str:
        rating_str = f" (Rating: {self.rating})" if self.rating else ""
        return f"Feedback on {self.target_type}:{self.target_id}{rating_str}"


# Import User for forward reference resolution
# from app.models.user import User  # Commented to avoid circular import

# Update forward references
ConversationHistory.model_rebuild()
ConversationMessage.model_rebuild()
UserFeedback.model_rebuild()