# Models package initialization
# Import all models to ensure they are available for SQLModel

# Import base table class
from app.database.base import BaseTable

# Import all models
from app.models.user import User, Team, UserGroup, GroupMembership, SystemRole
from app.models.permissions import AccessControl, PermissionAuditLog, ResourceType, PrincipalType, PermissionLevel, PermissionAction
from app.models.knowledge import KnowledgeSource, SourceVersion, SyncSnapshot, KnowledgeSet, KnowledgeChunk, SourceType, SourceStatus
from app.models.conversation import ConversationHistory, ConversationMessage, UserFeedback, MessageSender, ConversationStatus
from app.models.training import (
    Question, QuestionVersion, TrainingPlan, TrainingPlanVersion, 
    PlanAssignment, UserTask, UserAnswer,
    QuestionType, QuestionStatus, DifficultyLevel, TaskStatus
)
from app.models.storage import StorageDirectory, DirectoryType

__all__ = [
    # Base
    "BaseTable",
    
    # User and Organization Models
    "User", "Team", "UserGroup", "GroupMembership", "SystemRole",
    
    # Permission Models
    "AccessControl", "PermissionAuditLog", 
    "ResourceType", "PrincipalType", "PermissionLevel", "PermissionAction",
    
    # Knowledge Models
    "KnowledgeSource", "SourceVersion", "SyncSnapshot", "KnowledgeSet", "KnowledgeChunk",
    "SourceType", "SourceStatus",
    
    # Conversation Models
    "ConversationHistory", "ConversationMessage", "UserFeedback",
    "MessageSender", "ConversationStatus",
    
    # Training Models
    "Question", "QuestionVersion", "TrainingPlan", "TrainingPlanVersion",
    "PlanAssignment", "UserTask", "UserAnswer",
    "QuestionType", "QuestionStatus", "DifficultyLevel", "TaskStatus",
    
    # Storage Models
    "StorageDirectory", "DirectoryType",
]

# Model registry for introspection and dynamic operations
MODEL_REGISTRY = {
    # User and Organization
    "User": User,
    "Team": Team,
    "UserGroup": UserGroup,
    "GroupMembership": GroupMembership,
    
    # Permissions
    "AccessControl": AccessControl,
    "PermissionAuditLog": PermissionAuditLog,
    
    # Knowledge
    "KnowledgeSource": KnowledgeSource,
    "SourceVersion": SourceVersion,
    "SyncSnapshot": SyncSnapshot,
    "KnowledgeSet": KnowledgeSet,
    "KnowledgeChunk": KnowledgeChunk,
    
    # Conversation
    "ConversationHistory": ConversationHistory,
    "ConversationMessage": ConversationMessage,
    "UserFeedback": UserFeedback,
    
    # Training
    "Question": Question,
    "QuestionVersion": QuestionVersion,
    "TrainingPlan": TrainingPlan,
    "TrainingPlanVersion": TrainingPlanVersion,
    "PlanAssignment": PlanAssignment,
    "UserTask": UserTask,
    "UserAnswer": UserAnswer,
    
    # Storage
    "StorageDirectory": StorageDirectory,
}