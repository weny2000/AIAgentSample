"""
Response models for organization API
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

from ..models.user import Team


class OrganizationResponse(BaseModel):
    """Organization response model"""
    id: uuid.UUID
    name: str
    description: Optional[str]
    parent_team_id: Optional[uuid.UUID]
    user_count: int
    child_count: int
    created_at: Optional[datetime]
    created_by: Optional[uuid.UUID]
    
    @classmethod
    def from_team(cls, team: Team) -> "OrganizationResponse":
        """Create response from Team model"""
        return cls(
            id=team.id,
            name=team.name,
            description=team.description,
            parent_team_id=team.parent_team_id,
            user_count=len(team.users) if team.users else 0,
            child_count=len(team.child_teams) if team.child_teams else 0,
            created_at=team.created_at,
            created_by=team.created_by
        )
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OrganizationResponse":
        """Create response from dictionary"""
        return cls(
            id=uuid.UUID(data["id"]),
            name=data["name"],
            description=data.get("description"),
            parent_team_id=uuid.UUID(data["parent_team_id"]) if data.get("parent_team_id") else None,
            user_count=data.get("user_count", 0),
            child_count=data.get("child_count", 0),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            created_by=uuid.UUID(data["created_by"]) if data.get("created_by") else None
        )


class OrganizationHierarchyResponse(BaseModel):
    """Organization hierarchy response model"""
    organization: Dict[str, Any]
    parent: Optional[Dict[str, Any]]
    children: List[Dict[str, Any]]
    path: List[Dict[str, Any]]
    user_count: int