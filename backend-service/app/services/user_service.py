"""
User business logic service
"""

from typing import Optional, Dict, Any, List
import uuid
import secrets
import string
from sqlmodel import Session, select
import bcrypt

from ..database.base import audit_context
from ..models.user import User, Team, SystemRole


class UserService:
    """User management service"""
    
    def _generate_secure_password(self, length: int = 12) -> str:
        """Generate a cryptographically secure random password"""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))
    
    def _hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def _validate_user_input(self, username: str, email: str, full_name: str, team_id: uuid.UUID) -> None:
        """Validate user input parameters"""
        # Username validation
        if not username or len(username.strip()) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(username) > 100:
            raise ValueError("Username cannot exceed 100 characters")
        if not username.replace('_', '').replace('-', '').isalnum():
            raise ValueError("Username can only contain letters, numbers, underscore and hyphen")
        
        # Email validation (basic)
        if not email or '@' not in email:
            raise ValueError("Valid email address is required")
        if len(email) > 200:
            raise ValueError("Email cannot exceed 200 characters")
        
        # Full name validation
        if not full_name or len(full_name.strip()) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(full_name) > 200:
            raise ValueError("Full name cannot exceed 200 characters")
        
        # Team ID is required
        if not team_id:
            raise ValueError("User must be assigned to an organization")
    
    async def create_user(
        self,
        username: str,
        email: str,
        full_name: str,
        team_id: uuid.UUID,
        session: Session,
        role: SystemRole = SystemRole.USER,
        password: Optional[str] = None,
        is_active: bool = True,
        created_by_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Create new user
        
        Args:
            username: Unique username
            email: User email address
            full_name: User's full display name
            team_id: Organization ID (required)
            role: System role (default: USER)
            password: User password (if None, generates secure password)
            is_active: Whether user account is active
            created_by_user_id: Creator user ID
            session: Database session
            
        Returns:
            Dict containing user info and generated password (if applicable)
            
        Raises:
            ValueError: Input validation failed or business rule violation
        """
        
        # Clean and validate input
        username = username.strip().lower()
        email = email.strip().lower()
        full_name = full_name.strip()
        
        self._validate_user_input(username, email, full_name, team_id)
        
        # Validate organization exists
        organization = session.get(Team, team_id)
        if not organization:
            raise ValueError(f"Organization not found: {team_id}")
        
        # Check for duplicate username
        existing_user = session.exec(
            select(User).where(User.username == username)
        ).first()
        if existing_user:
            raise ValueError(f"Username '{username}' already exists")
        
        # Check for duplicate email
        existing_email = session.exec(
            select(User).where(User.email == email)
        ).first()
        if existing_email:
            raise ValueError(f"Email '{email}' already exists")
        
        # Generate password if not provided
        generated_password = None
        if not password:
            generated_password = self._generate_secure_password()
            password = generated_password
        
        # Hash password
        password_hash = self._hash_password(password)
        
        # Create user record
        with audit_context(created_by_user_id):
            new_user = User(
                username=username,
                email=email,
                full_name=full_name,
                role=role,
                team_id=team_id,
                is_active=is_active,
                password_hash=password_hash
            )
            
            # Set audit fields
            new_user.set_audit_fields_for_create()
            
            session.add(new_user)
            session.commit()
            session.refresh(new_user)
            
            result = {
                "user": {
                    "id": str(new_user.id),
                    "username": new_user.username,
                    "email": new_user.email,
                    "full_name": new_user.full_name,
                    "role": new_user.role,
                    "team_id": str(new_user.team_id),
                    "team_name": organization.name,
                    "is_active": new_user.is_active,
                    "created_at": new_user.created_at.isoformat() if new_user.created_at else None
                }
            }
            
            # Include generated password in response (for secure transmission to admin)
            if generated_password:
                result["generated_password"] = generated_password
                result["password_generated"] = True
            else:
                result["password_generated"] = False
            
            return result
    
    async def update_user(
        self,
        user_id: uuid.UUID,
        session: Session,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        team_id: Optional[uuid.UUID] = None,
        role: Optional[SystemRole] = None,
        is_active: Optional[bool] = None,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Update existing user
        
        Args:
            user_id: User ID to update
            email: New email (optional)
            full_name: New full name (optional)
            team_id: New organization ID (optional)
            role: New system role (optional)
            is_active: New active status (optional)
            updated_by_user_id: Updater user ID
            session: Database session
            
        Returns:
            Dict containing updated user info
            
        Raises:
            ValueError: User not found or validation failed
        """
        
        # Get existing user
        user = session.get(User, user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        # Validate team if provided
        if team_id is not None:
            if not team_id:
                raise ValueError("User must be assigned to an organization")
            
            organization = session.get(Team, team_id)
            if not organization:
                raise ValueError(f"Organization not found: {team_id}")
        
        # Validate email if provided
        if email is not None:
            email = email.strip().lower()
            if not email or '@' not in email:
                raise ValueError("Valid email address is required")
            if len(email) > 200:
                raise ValueError("Email cannot exceed 200 characters")
            
            # Check for duplicate email (excluding current user)
            existing_email = session.exec(
                select(User).where(User.email == email, User.id != user_id)
            ).first()
            if existing_email:
                raise ValueError(f"Email '{email}' already exists")
        
        # Validate full name if provided
        if full_name is not None:
            full_name = full_name.strip()
            if not full_name or len(full_name) < 2:
                raise ValueError("Full name must be at least 2 characters")
            if len(full_name) > 200:
                raise ValueError("Full name cannot exceed 200 characters")
        
        # Update user record
        with audit_context(updated_by_user_id):
            if email is not None:
                user.email = email
            if full_name is not None:
                user.full_name = full_name
            if team_id is not None:
                user.team_id = team_id
            if role is not None:
                user.role = role
            if is_active is not None:
                user.is_active = is_active
            
            # Set audit fields
            user.set_audit_fields_for_update()
            
            session.add(user)
            session.commit()
            session.refresh(user)
            
            # Get organization name
            organization = session.get(Team, user.team_id) if user.team_id else None
            
            return {
                "user": {
                    "id": str(user.id),
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "team_id": str(user.team_id) if user.team_id else None,
                    "team_name": organization.name if organization else None,
                    "is_active": user.is_active,
                    "updated_at": user.updated_at.isoformat() if user.updated_at else None
                }
            }
    
    async def get_user_by_id(self, user_id: uuid.UUID, session: Session) -> Dict[str, Any]:
        """Get user by ID with organization information"""
        user = session.get(User, user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        # Get organization information
        organization = session.get(Team, user.team_id) if user.team_id else None
        
        return {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "team_id": str(user.team_id) if user.team_id else None,
            "team_name": organization.name if organization else None,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None
        }
    
    async def get_user_by_username(self, username: str, session: Session) -> Dict[str, Any]:
        """Get user by username with organization information"""
        user = session.exec(
            select(User).where(User.username == username.strip().lower())
        ).first()
        
        if not user:
            raise ValueError(f"User not found: {username}")
        
        return await self.get_user_by_id(user.id, session)
    
    async def list_users_in_organization(
        self, 
        team_id: uuid.UUID,
        session: Session,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """List all users in an organization"""
        # Validate organization exists
        organization = session.get(Team, team_id)
        if not organization:
            raise ValueError(f"Organization not found: {team_id}")
        
        # Build query
        query = select(User).where(User.team_id == team_id)
        if not include_inactive:
            query = query.where(User.is_active == True)
        
        users = session.exec(query).all()
        
        return [
            {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
            for user in users
        ]
    
    async def change_password(
        self,
        user_id: uuid.UUID,
        new_password: str,
        session: Session,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> None:
        """
        Change user password
        
        Args:
            user_id: User ID
            new_password: New password
            updated_by_user_id: Who is changing the password
            session: Database session
            
        Raises:
            ValueError: User not found or password validation failed
        """
        
        # Validate password
        if not new_password or len(new_password) < 6:
            raise ValueError("Password must be at least 6 characters")
        
        # Get user
        user = session.get(User, user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        # Hash new password
        password_hash = self._hash_password(new_password)
        
        # Update password
        with audit_context(updated_by_user_id):
            user.password_hash = password_hash
            user.set_audit_fields_for_update()
            
            session.add(user)
            session.commit()
    
    async def deactivate_user(
        self,
        user_id: uuid.UUID,
        session: Session,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> None:
        """Deactivate user account"""
        await self.update_user(
            user_id=user_id,
            session=session,
            is_active=False,
            updated_by_user_id=updated_by_user_id
        )
    
    async def activate_user(
        self,
        user_id: uuid.UUID,
        session: Session,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> None:
        """Activate user account"""
        await self.update_user(
            user_id=user_id,
            session=session,
            is_active=True,
            updated_by_user_id=updated_by_user_id
        )