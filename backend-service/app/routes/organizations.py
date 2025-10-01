"""
Organization API routes - migrated from organization-service
Provides organization management endpoints with proper authentication
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request
from typing import Optional, List
import uuid

from sqlmodel import Session
from ..database.connection import get_sync_session
from ..database.base import audit_context
from ..models.user import Team

from ..models.requests import CreateOrganizationRequest
from ..models.responses import OrganizationResponse, OrganizationHierarchyResponse
from ..services.organization_service import OrganizationService
from .auth import get_current_user_dependency  # Import the dependency function

router = APIRouter(tags=["Organizations"])

# Initialize service
org_service = OrganizationService()


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: CreateOrganizationRequest,
    current_user: dict = Depends(get_current_user_dependency),
    session: Session = Depends(get_sync_session)
):
    """
    Create new organization under a parent organization
    
    - Validate organization name uniqueness under same parent
    - Validate parent organization exists
    - Create organization record with audit fields
    """
    
    try:
        user_id = uuid.UUID(current_user["user_id"]) if current_user["user_id"] != "system_user" else None
        
        organization = await org_service.create_organization(
            name=request.name,
            description=request.description,
            parent_team_id=request.parent_team_id,
            created_by_user_id=user_id,
            session=session
        )
        
        return OrganizationResponse.from_team(organization)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization: {str(e)}"
        )


@router.get("/{organization_id}/hierarchy", response_model=OrganizationHierarchyResponse)
async def get_organization_hierarchy(
    organization_id: uuid.UUID,
    current_user: dict = Depends(get_current_user_dependency),
    session: Session = Depends(get_sync_session)
):
    """Get organization hierarchy structure"""
    
    try:
        hierarchy = await org_service.get_organization_hierarchy(organization_id, session)
        return OrganizationHierarchyResponse(**hierarchy)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/", response_model=List[OrganizationResponse])
async def list_organizations(
    parent_id: Optional[uuid.UUID] = None,
    current_user: dict = Depends(get_current_user_dependency),
    session: Session = Depends(get_sync_session)
):
    """
    List organizations
    
    - parent_id: Optional, specify parent organization ID to get children
    - If parent_id is not specified, returns root level organizations
    """
    
    organizations = await org_service.list_organizations(parent_id, session)
    return [OrganizationResponse.from_dict(org) for org in organizations]


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: uuid.UUID,
    current_user: dict = Depends(get_current_user_dependency),
    session: Session = Depends(get_sync_session)
):
    """Get single organization details"""
    
    organization = session.get(Team, organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization not found: {organization_id}"
        )
    
    return OrganizationResponse.from_team(organization)