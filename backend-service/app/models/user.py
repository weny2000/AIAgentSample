# User and organization models
# Based on architecture design section 5: Data & Storage

from sqlmodel import Field, Relationship
from typing import Optional, List, Literal
from enum import Enum
from datetime import datetime
import uuid
from app.database.base import BaseTable


class SystemRole(str, Enum):
    """System-level roles for users"""
    ADMIN = "ADMIN"
    TEAM_ADMIN = "TEAM_ADMIN"
    USER = "USER"


class Team(BaseTable, table=True):
    """
    Organization hierarchy (Teams)
    Represents organizational structure with hierarchical relationships
    """
    __tablename__ = "teams"
    
    name: str = Field(max_length=200, description="Team name")
    description: Optional[str] = Field(default=None, max_length=1000, description="Team description")
    parent_team_id: Optional[uuid.UUID] = Field(
        default=None, 
        foreign_key="teams.id",
        description="Parent team ID for hierarchical structure"
    )
    
    # Self-referential relationship for hierarchy
    parent_team: Optional["Team"] = Relationship(
        back_populates="child_teams",
        sa_relationship_kwargs={"remote_side": "Team.id"}
    )
    child_teams: List["Team"] = Relationship(back_populates="parent_team")
    
    # Users in this team
    users: List["User"] = Relationship(back_populates="team")


class User(BaseTable, table=True):
    """
    User information
    Core user entity with system role and team assignment
    """
    __tablename__ = "users"
    
    username: str = Field(max_length=100, unique=True, index=True, description="Unique username")
    email: str = Field(max_length=200, unique=True, index=True, description="User email address")
    full_name: str = Field(max_length=200, description="User's full display name")
    
    # System-level role
    role: SystemRole = Field(default=SystemRole.USER, description="System-level role")
    
    # Team assignment
    team_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="teams.id", 
        description="Team membership"
    )
    team: Optional["Team"] = Relationship(back_populates="users")
    
    # Account status
    is_active: bool = Field(default=True, description="Whether user account is active")
    
    # Authentication fields (simplified - in production use proper auth system)
    password_hash: Optional[str] = Field(default=None, max_length=255, description="Hashed password")
    
    # Relationships
    group_memberships: List["GroupMembership"] = Relationship(back_populates="user")
    conversations: List["ConversationHistory"] = Relationship(back_populates="user")  # From conversation.py
    user_tasks: List["UserTask"] = Relationship(back_populates="user")  # From training.py
    user_answers: List["UserAnswer"] = Relationship(back_populates="user")  # From training.py
    
    def __str__(self) -> str:
        return f"{self.full_name} ({self.username})"


class UserGroup(BaseTable, table=True):
    """
    User group information
    Groups for organizing users beyond team hierarchy
    """
    __tablename__ = "user_groups"
    
    name: str = Field(max_length=200, description="Group name")
    description: Optional[str] = Field(default=None, max_length=1000, description="Group description")
    
    # Group metadata
    is_active: bool = Field(default=True, description="Whether group is active")
    
    # Relationships
    memberships: List["GroupMembership"] = Relationship(back_populates="group")


class GroupMembership(BaseTable, table=True):
    """
    Group memberships
    Many-to-many relationship between users and groups
    """
    __tablename__ = "group_memberships"
    
    user_id: uuid.UUID = Field(foreign_key="users.id", description="User ID")
    group_id: uuid.UUID = Field(foreign_key="user_groups.id", description="Group ID")
    
    # Membership metadata
    joined_at: datetime = Field(description="When user joined the group")
    is_active: bool = Field(default=True, description="Whether membership is active")
    
    # Relationships
    user: User = Relationship(back_populates="group_memberships")
    group: UserGroup = Relationship(back_populates="memberships")


# Update forward references
Team.model_rebuild()
User.model_rebuild()
UserGroup.model_rebuild()
GroupMembership.model_rebuild()
