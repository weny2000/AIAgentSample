"""
Request models for organization API
"""

from pydantic import BaseModel, Field
from typing import Optional
import uuid


class CreateOrganizationRequest(BaseModel):
    """Create organization request model"""
    name: str = Field(min_length=3, max_length=200, description="Organization name")
    description: Optional[str] = Field(None, max_length=1000, description="Organization description")
    parent_team_id: uuid.UUID = Field(description="Parent organization ID (required)")