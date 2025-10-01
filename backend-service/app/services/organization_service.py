"""
Organization business logic service
"""

from typing import Optional, Dict, Any, List
import uuid
from sqlmodel import Session, select

from ..database.base import audit_context
from ..models.user import Team


class OrganizationService:
    """Organization management service"""
    
    async def create_organization(
        self,
        name: str,
        description: Optional[str],
        parent_team_id: Optional[uuid.UUID],
        created_by_user_id: Optional[uuid.UUID],
        session: Session
    ) -> Team:
        """
        Create new organization
        
        Args:
            name: Organization name
            description: Organization description
            parent_team_id: Parent organization ID (None for root organization)
            created_by_user_id: Creator user ID
            session: Database session
            
        Returns:
            Team: Created organization object
            
        Raises:
            ValueError: Input validation failed
        """
        
        # Input validation
        if not name or len(name.strip()) < 3:
            raise ValueError("Organization name must be at least 3 characters")
        
        if len(name) > 200:
            raise ValueError("Organization name cannot exceed 200 characters")
        
        name = name.strip()
        
        # Special validation for root organization (no parent)
        if parent_team_id is None:
            # Check if a root organization already exists
            existing_root = session.exec(
                select(Team).where(Team.parent_team_id.is_(None))
            ).first()
            if existing_root:
                raise ValueError("Root organization already exists. Only one root organization is allowed.")
        
        # Validate parent organization exists (only if parent_team_id is provided)
        if parent_team_id is not None:
            parent_team = session.get(Team, parent_team_id)
            if not parent_team:
                raise ValueError(f"Parent organization not found: {parent_team_id}")
        
        # Check for duplicate names under same parent
        existing = session.exec(
            select(Team).where(
                Team.name == name,
                Team.parent_team_id == parent_team_id
            )
        ).first()
        
        if existing:
            raise ValueError(f"Organization named '{name}' already exists under the same parent")
        
        # Create organization record
        with audit_context(created_by_user_id):
            new_organization = Team(
                name=name,
                description=description,
                parent_team_id=parent_team_id
            )
            
            # Set audit fields
            new_organization.set_audit_fields_for_create()
            
            session.add(new_organization)
            session.commit()
            session.refresh(new_organization)
            
            return new_organization
    
    async def get_root_organization(self, session: Session) -> Optional[Team]:
        """Get the root organization (there should be only one)"""
        return session.exec(
            select(Team).where(Team.parent_team_id.is_(None))
        ).first()
    
    async def ensure_single_root_organization(self, session: Session) -> bool:
        """Verify that there is exactly one root organization"""
        root_orgs = session.exec(
            select(Team).where(Team.parent_team_id.is_(None))
        ).all()
        return len(root_orgs) == 1
    
    async def get_organization_hierarchy(self, organization_id: uuid.UUID, session: Session) -> Dict[str, Any]:
        """Get organization hierarchy information"""
        organization = session.get(Team, organization_id)
        if not organization:
            raise ValueError(f"Organization not found: {organization_id}")
        
        # Get parent organization info
        parent_info = None
        if organization.parent_team_id:
            parent = session.get(Team, organization.parent_team_id)
            if parent:
                parent_info = {
                    "id": str(parent.id),
                    "name": parent.name
                }
        
        # Get child organizations
        children_query = select(Team).where(Team.parent_team_id == organization_id)
        children = session.exec(children_query).all()
        
        children_info = [
            {
                "id": str(child.id),
                "name": child.name,
                "user_count": len(child.users) if child.users else 0
            }
            for child in children
        ]
        
        # Build organization path (from root to current)
        path = []
        current = organization
        visited = set()
        
        while current and current.id not in visited:
            visited.add(current.id)
            path.insert(0, {"id": str(current.id), "name": current.name})
            
            if current.parent_team_id:
                current = session.get(Team, current.parent_team_id)
            else:
                break
        
        return {
            "organization": {
                "id": str(organization.id),
                "name": organization.name,
                "description": organization.description
            },
            "parent": parent_info,
            "children": children_info,
            "path": path,
            "user_count": len(organization.users) if organization.users else 0
        }
    
    async def list_organizations(self, parent_id: Optional[uuid.UUID], session: Session) -> List[Dict[str, Any]]:
        """List organizations (can filter by parent)"""
        if parent_id:
            query = select(Team).where(Team.parent_team_id == parent_id)
        else:
            query = select(Team).where(Team.parent_team_id.is_(None))
        
        organizations = session.exec(query).all()
        
        return [
            {
                "id": str(org.id),
                "name": org.name,
                "description": org.description,
                "parent_team_id": str(org.parent_team_id) if org.parent_team_id else None,
                "user_count": len(org.users) if org.users else 0,
                "child_count": len(org.child_teams) if org.child_teams else 0,
                "created_at": org.created_at.isoformat() if org.created_at else None,
                "created_by": str(org.created_by) if org.created_by else None
            }
            for org in organizations
        ]