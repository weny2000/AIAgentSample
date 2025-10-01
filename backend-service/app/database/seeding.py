"""
Database seeding module for creating initial data
Idempotent operations - safe to run multiple times
Uses service layer for business logic consistency
"""

import uuid
import os
import secrets
import string
from datetime import datetime, timezone
from sqlmodel import Session, select
from typing import Optional

from app.models.user import Team, User, SystemRole
from app.database.connection import get_sync_engine
from app.database.base import audit_context
from app.services.organization_service import OrganizationService
from app.services.user_service import UserService
from app.services.storage_service import StorageService
from app.models.storage import DirectoryType


class DatabaseSeeder:
    """Handle initial data seeding for the application"""
    
    def __init__(self):
        self.engine = get_sync_engine()
        self.org_service = OrganizationService()
        self.user_service = UserService()
        self.storage_service = StorageService()
    
    def _generate_secure_password(self, length: int = 16) -> str:
        """Generate a cryptographically secure random password"""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))
    
    def _get_admin_password(self) -> str:
        """Get admin password from environment or generate secure one"""
        # Try to get password from environment variable first
        env_password = os.getenv("ADMIN_PASSWORD")
        if env_password:
            print("🔑 Using admin password from environment variable")
            return env_password
        
        # Check if we have a stored password file (for development consistency)
        password_file = "/tmp/.admin_password"
        if os.path.exists(password_file):
            try:
                with open(password_file, 'r') as f:
                    stored_password = f.read().strip()
                    if stored_password:
                        print("🔑 Using stored admin password from file")
                        return stored_password
            except Exception:
                pass
        
        # Generate new secure password
        new_password = self._generate_secure_password()
        print("🔑 Generated new secure admin password")
        print("=" * 60)
        print(f"🚨 ROOT ADMIN PASSWORD: {new_password}")
        print("=" * 60)
        print("⚠️  IMPORTANT: Save this password immediately!")
        print("⚠️  You will need this to login as root_admin")
        
        # Store for development consistency (optional)
        try:
            with open(password_file, 'w') as f:
                f.write(new_password)
            print(f"💾 Password also saved to: {password_file}")
            print("� Tip: You can view it later with: cat /tmp/.admin_password")
        except Exception as e:
            print(f"⚠️  Could not store password file: {e}")
            print("� Please copy the password above manually")
        
        return new_password
        
    def seed_all(self) -> None:
        """Run all seeding operations"""
        print("🌱 Starting database seeding...")
        
        # Create system user for audit purposes
        system_user_id = self._ensure_system_user()
        
        with audit_context(system_user_id):
            # Create root organization
            root_org = self._ensure_root_organization()
            
            # Create admin user
            admin_user = self._ensure_admin_user(root_org.id)
            
            # Initialize storage directories
            self._ensure_storage_directories(root_org, admin_user, system_user_id)
            
        print("✅ Database seeding completed successfully")
    
    def _ensure_system_user(self) -> uuid.UUID:
        """Ensure system user exists for audit purposes"""
        with Session(self.engine) as session:
            # Check if system user exists
            system_user = session.exec(
                select(User).where(User.username == "system")
            ).first()
            
            if not system_user:
                print("📝 Creating system user...")
                system_user = User(
                    username="system",
                    email="system@ai-knowledge-platform.local",
                    full_name="System User",
                    role=SystemRole.ADMIN,
                    is_active=False,  # System user is not for login
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                session.add(system_user)
                session.commit()
                session.refresh(system_user)
                print(f"✅ System user created: {system_user.id}")
            else:
                print(f"ℹ️  System user already exists: {system_user.id}")
                
            return system_user.id
    
    def _ensure_root_organization(self) -> Team:
        """Ensure root organization exists (and is unique)"""
        with Session(self.engine) as session:
            # Check if root organization exists
            root_orgs = session.exec(
                select(Team).where(Team.parent_team_id.is_(None))
            ).all()
            
            if len(root_orgs) > 1:
                # This should never happen, but if it does, it's a critical error
                raise ValueError(f"Multiple root organizations found ({len(root_orgs)}). Database integrity compromised.")
            
            if len(root_orgs) == 0:
                print("🏢 Creating root organization...")
                try:
                    # Create the single root organization
                    new_org = Team(
                        name="AI Knowledge Platform",
                        description="Root organization for the AI Knowledge Platform",
                        parent_team_id=None
                    )
                    new_org.set_audit_fields_for_create()
                    
                    session.add(new_org)
                    session.commit()
                    session.refresh(new_org)
                    root_org = new_org
                    print(f"✅ Root organization created: {root_org.name} ({root_org.id})")
                except Exception as e:
                    print(f"❌ Failed to create root organization: {e}")
                    session.rollback()
                    raise e
            else:
                root_org = root_orgs[0]
                print(f"ℹ️  Root organization already exists: {root_org.name} ({root_org.id})")
                
            return root_org
    
    def _ensure_admin_user(self, root_org_id: uuid.UUID) -> User:
        """Ensure admin user exists"""
        with Session(self.engine) as session:
            # Check if admin user exists
            admin_user = session.exec(
                select(User).where(User.username == "root_admin")
            ).first()
            
            if not admin_user:
                print("👤 Creating root admin user...")
                
                # Get secure admin password
                password = self._get_admin_password()
                
                try:
                    # Hash password using bcrypt
                    import bcrypt
                    salt = bcrypt.gensalt()
                    password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
                    
                    admin_user = User(
                        username="root_admin",
                        email="admin@ai-knowledge-platform.local",
                        full_name="Root Administrator",
                        role=SystemRole.ADMIN,
                        team_id=root_org_id,
                        is_active=True,
                        password_hash=password_hash
                    )
                    admin_user.set_audit_fields_for_create()
                    
                    session.add(admin_user)
                    session.commit()
                    session.refresh(admin_user)
                    print(f"✅ Root admin user created: {admin_user.username} ({admin_user.id})")
                    
                except Exception as e:
                    print(f"❌ Failed to create admin user: {e}")
                    session.rollback()
                    raise e
            else:
                print(f"ℹ️  Root admin user already exists: {admin_user.username} ({admin_user.id})")
                
                # Ensure admin is assigned to root organization
                if admin_user.team_id != root_org_id:
                    print("🔄 Updating admin user's organization assignment...")
                    admin_user.team_id = root_org_id
                    admin_user.set_audit_fields_for_update()
                    session.add(admin_user)
                    session.commit()
                    print("✅ Admin user organization updated")
                
            return admin_user
    
    async def _create_sample_organizations_with_service(self, root_org_id: uuid.UUID, system_user_id: uuid.UUID) -> None:
        """Create sample organizations using OrganizationService (optional)"""
        with Session(self.engine) as session:
            sample_orgs = [
                {
                    "name": "Engineering Department",
                    "description": "Software engineering and development teams"
                },
                {
                    "name": "Research Department", 
                    "description": "AI research and innovation teams"
                },
                {
                    "name": "Operations Department",
                    "description": "Operations and infrastructure teams"
                }
            ]
            
            for org_data in sample_orgs:
                # Check if organization already exists
                existing = session.exec(
                    select(Team).where(
                        Team.name == org_data["name"],
                        Team.parent_team_id == root_org_id
                    )
                ).first()
                
                if not existing:
                    print(f"🏗️  Creating sample organization: {org_data['name']}")
                    try:
                        new_org = await self.org_service.create_organization(
                            name=org_data["name"],
                            description=org_data["description"],
                            parent_team_id=root_org_id,
                            created_by_user_id=system_user_id,
                            session=session
                        )
                        print(f"✅ Sample organization created: {new_org.name}")
                    except Exception as e:
                        print(f"⚠️  Failed to create sample organization {org_data['name']}: {e}")
                else:
                    print(f"ℹ️  Sample organization already exists: {org_data['name']}")

    def _create_sample_organizations(self, root_org_id: uuid.UUID) -> None:
        """Create sample organizations for development (optional)"""
        with Session(self.engine) as session:
            sample_orgs = [
                {
                    "name": "Engineering Department",
                    "description": "Software engineering and development teams"
                },
                {
                    "name": "Research Department", 
                    "description": "AI research and innovation teams"
                },
                {
                    "name": "Operations Department",
                    "description": "Operations and infrastructure teams"
                }
            ]
            
            for org_data in sample_orgs:
                # Check if organization already exists
                existing = session.exec(
                    select(Team).where(
                        Team.name == org_data["name"],
                        Team.parent_team_id == root_org_id
                    )
                ).first()
                
                if not existing:
                    print(f"🏗️  Creating sample organization: {org_data['name']}")
                    org = Team(
                        name=org_data["name"],
                        description=org_data["description"],
                        parent_team_id=root_org_id
                    )
                    org.set_audit_fields_for_create()
                    
                    session.add(org)
                    session.commit()
                    print(f"✅ Sample organization created: {org_data['name']}")
                else:
                    print(f"ℹ️  Sample organization already exists: {org_data['name']}")
    
    def _ensure_storage_directories(self, root_org: Team, admin_user: User, system_user_id: uuid.UUID) -> None:
        """Ensure storage directories exist for root organization and admin user"""
        with Session(self.engine) as session:
            print("💾 Initializing storage directories...")
            
            # Import storage models
            from app.models.storage import StorageDirectory, DirectoryType
            from sqlmodel import select
            
            # 1. Create root organization storage directory
            try:
                # Check if organization storage exists
                org_dir = session.exec(
                    select(StorageDirectory).where(
                        StorageDirectory.owner_type == DirectoryType.ORGANIZATION,
                        StorageDirectory.owner_id == root_org.id
                    )
                ).first()
                
                if not org_dir:
                    print(f"📁 Creating storage directory for root organization: {root_org.name}")
                    
                    # Generate directory path
                    org_storage_path = f"/app/storage/organizations/{root_org.id}"
                    
                    # Create physical directory
                    from pathlib import Path
                    Path(org_storage_path).mkdir(parents=True, exist_ok=True)
                    
                    # Create database record
                    org_storage = StorageDirectory(
                        name=f"{root_org.name} Storage",
                        description="Root organization storage directory",
                        owner_type=DirectoryType.ORGANIZATION,
                        owner_id=root_org.id,
                        root_path=org_storage_path,
                        max_size_bytes=10 * 1024 * 1024 * 1024,  # 10GB default
                        current_size_bytes=0,
                        is_active=True
                    )
                    org_storage.set_audit_fields_for_create()
                    
                    session.add(org_storage)
                    session.commit()
                    print(f"✅ Organization storage created: {org_storage_path}")
                else:
                    print(f"ℹ️  Organization storage already exists: {org_dir.name}")
                    
            except Exception as e:
                print(f"⚠️  Failed to create organization storage: {e}")
            
            # 2. Create admin user storage directory
            try:
                # Check if user storage exists
                user_dir = session.exec(
                    select(StorageDirectory).where(
                        StorageDirectory.owner_type == DirectoryType.USER,
                        StorageDirectory.owner_id == admin_user.id
                    )
                ).first()
                
                if not user_dir:
                    print(f"👤 Creating storage directory for admin user: {admin_user.username}")
                    
                    # Generate directory path
                    user_storage_path = f"/app/storage/users/{admin_user.id}"
                    
                    # Create physical directory
                    from pathlib import Path
                    Path(user_storage_path).mkdir(parents=True, exist_ok=True)
                    
                    # Create database record
                    user_storage = StorageDirectory(
                        name=f"{admin_user.username} Storage",
                        description="Administrator user storage directory",
                        owner_type=DirectoryType.USER,
                        owner_id=admin_user.id,
                        root_path=user_storage_path,
                        max_size_bytes=5 * 1024 * 1024 * 1024,  # 5GB default
                        current_size_bytes=0,
                        is_active=True
                    )
                    user_storage.set_audit_fields_for_create()
                    
                    session.add(user_storage)
                    session.commit()
                    print(f"✅ Admin user storage created: {user_storage_path}")
                else:
                    print(f"ℹ️  Admin user storage already exists: {user_dir.name}")
                    
            except Exception as e:
                print(f"⚠️  Failed to create admin user storage: {e}")
            
            print("💾 Storage directories initialization completed")


# Create seeder instance
seeder = DatabaseSeeder()