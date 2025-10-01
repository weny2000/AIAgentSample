"""
Storage business logic service
"""

import os
from pathlib import Path
from sqlmodel import Session, select
from typing import Optional, Dict, Any, List
import uuid

from ..database.base import audit_context
from ..models.user import User, Team
from ..models.storage import StorageDirectory, DirectoryType


class StorageService:
    """Storage management service for organizations and users"""
    
    def __init__(self, base_storage_path: str = "/app/storage"):
        """
        Initialize storage service
        
        Args:
            base_storage_path: Base path for all storage directories
        """
        self.base_storage_path = Path(base_storage_path)
        # Ensure base storage directory exists
        self.base_storage_path.mkdir(parents=True, exist_ok=True)
    
    def _generate_directory_path(self, owner_type: DirectoryType, owner_id: uuid.UUID) -> str:
        """Generate unique directory path for owner"""
        if owner_type == DirectoryType.ORGANIZATION:
            return str(self.base_storage_path / "organizations" / str(owner_id))
        elif owner_type == DirectoryType.USER:
            return str(self.base_storage_path / "users" / str(owner_id))
        else:
            raise ValueError(f"Unknown directory type: {owner_type}")
    
    def _validate_owner_exists(self, owner_type: DirectoryType, owner_id: uuid.UUID, session: Session) -> None:
        """Validate that the owner (organization or user) exists"""
        if owner_type == DirectoryType.ORGANIZATION:
            owner = session.get(Team, owner_id)
            if not owner:
                raise ValueError(f"Organization not found: {owner_id}")
        elif owner_type == DirectoryType.USER:
            owner = session.get(User, owner_id)
            if not owner:
                raise ValueError(f"User not found: {owner_id}")
        else:
            raise ValueError(f"Unknown directory type: {owner_type}")
    
    async def create_root_directory(
        self,
        owner_type: DirectoryType,
        owner_id: uuid.UUID,
        session: Session,
        name: Optional[str] = None,
        description: Optional[str] = None,
        max_size_bytes: Optional[int] = None,
        created_by_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Create root directory for organization or user
        
        Args:
            owner_type: Type of owner (ORGANIZATION or USER)
            owner_id: ID of the owner
            name: Directory name (auto-generated if None)
            description: Directory description
            max_size_bytes: Maximum storage size in bytes
            created_by_user_id: Creator user ID
            session: Database session
            
        Returns:
            Dict containing directory info
            
        Raises:
            ValueError: Owner not found or root directory already exists
        """
        
        # Validate owner exists
        self._validate_owner_exists(owner_type, owner_id, session)
        
        # Check if root directory already exists for this owner
        existing_dir = session.exec(
            select(StorageDirectory).where(
                StorageDirectory.owner_type == owner_type,
                StorageDirectory.owner_id == owner_id
            )
        ).first()
        
        if existing_dir:
            raise ValueError(f"Root directory already exists for {owner_type.lower()}: {owner_id}")
        
        # Generate directory name if not provided
        if not name:
            if owner_type == DirectoryType.ORGANIZATION:
                org = session.get(Team, owner_id)
                name = f"{org.name}_Storage"
            else:  # USER
                user = session.get(User, owner_id)
                name = f"{user.username}_Storage"
        
        # Generate unique directory path
        root_path = self._generate_directory_path(owner_type, owner_id)
        
        # Create physical directory
        try:
            Path(root_path).mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise ValueError(f"Failed to create physical directory: {e}")
        
        # Create database record
        with audit_context(created_by_user_id):
            new_directory = StorageDirectory(
                name=name,
                description=description,
                owner_type=owner_type,
                owner_id=owner_id,
                root_path=root_path,
                max_size_bytes=max_size_bytes,
                current_size_bytes=0,
                is_active=True
            )
            
            new_directory.set_audit_fields_for_create()
            
            session.add(new_directory)
            session.commit()
            session.refresh(new_directory)
            
            return {
                "directory": {
                    "id": str(new_directory.id),
                    "name": new_directory.name,
                    "description": new_directory.description,
                    "owner_type": new_directory.owner_type,
                    "owner_id": str(new_directory.owner_id),
                    "root_path": new_directory.root_path,
                    "max_size_bytes": new_directory.max_size_bytes,
                    "current_size_bytes": new_directory.current_size_bytes,
                    "is_active": new_directory.is_active,
                    "created_at": new_directory.created_at.isoformat() if new_directory.created_at else None
                }
            }
    
    async def get_root_directory(
        self,
        owner_type: DirectoryType,
        owner_id: uuid.UUID,
        session: Session
    ) -> Optional[Dict[str, Any]]:
        """
        Get root directory for organization or user
        
        Args:
            owner_type: Type of owner (ORGANIZATION or USER)
            owner_id: ID of the owner
            session: Database session
            
        Returns:
            Dict containing directory info or None if not found
        """
        
        directory = session.exec(
            select(StorageDirectory).where(
                StorageDirectory.owner_type == owner_type,
                StorageDirectory.owner_id == owner_id
            )
        ).first()
        
        if not directory:
            return None
        
        return {
            "id": str(directory.id),
            "name": directory.name,
            "description": directory.description,
            "owner_type": directory.owner_type,
            "owner_id": str(directory.owner_id),
            "root_path": directory.root_path,
            "max_size_bytes": directory.max_size_bytes,
            "current_size_bytes": directory.current_size_bytes,
            "is_active": directory.is_active,
            "created_at": directory.created_at.isoformat() if directory.created_at else None,
            "updated_at": directory.updated_at.isoformat() if directory.updated_at else None
        }
    
    async def ensure_root_directory(
        self,
        owner_type: DirectoryType,
        owner_id: uuid.UUID,
        session: Session,
        created_by_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Ensure root directory exists for owner, create if not exists
        
        Args:
            owner_type: Type of owner (ORGANIZATION or USER)
            owner_id: ID of the owner
            created_by_user_id: Creator user ID
            session: Database session
            
        Returns:
            Dict containing directory info
        """
        
        # Check if directory already exists
        existing_dir = await self.get_root_directory(owner_type, owner_id, session)
        if existing_dir:
            return existing_dir
        
        # Create new directory
        return await self.create_root_directory(
            owner_type=owner_type,
            owner_id=owner_id,
            session=session,
            created_by_user_id=created_by_user_id
        )
    
    async def update_directory_usage(
        self,
        directory_id: uuid.UUID,
        new_size_bytes: int,
        session: Session,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Update directory storage usage
        
        Args:
            directory_id: Directory ID
            new_size_bytes: New storage usage in bytes
            updated_by_user_id: Updater user ID
            session: Database session
            
        Returns:
            Dict containing updated directory info
            
        Raises:
            ValueError: Directory not found or size exceeds limit
        """
        
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        # Check size limit
        if directory.max_size_bytes and new_size_bytes > directory.max_size_bytes:
            raise ValueError(f"Storage size ({new_size_bytes} bytes) exceeds limit ({directory.max_size_bytes} bytes)")
        
        # Update usage
        with audit_context(updated_by_user_id):
            directory.current_size_bytes = new_size_bytes
            directory.set_audit_fields_for_update()
            
            session.add(directory)
            session.commit()
            session.refresh(directory)
            
            return {
                "id": str(directory.id),
                "name": directory.name,
                "current_size_bytes": directory.current_size_bytes,
                "max_size_bytes": directory.max_size_bytes,
                "usage_percentage": (directory.current_size_bytes / directory.max_size_bytes * 100) if directory.max_size_bytes else None,
                "updated_at": directory.updated_at.isoformat() if directory.updated_at else None
            }
    
    async def get_directory_usage_stats(
        self,
        session: Session,
        owner_type: Optional[DirectoryType] = None
    ) -> Dict[str, Any]:
        """
        Get storage usage statistics
        
        Args:
            owner_type: Filter by owner type (optional)
            session: Database session
            
        Returns:
            Dict containing usage statistics
        """
        
        # Build query
        query = select(StorageDirectory).where(StorageDirectory.is_active == True)
        if owner_type:
            query = query.where(StorageDirectory.owner_type == owner_type)
        
        directories = session.exec(query).all()
        
        # Calculate statistics
        total_directories = len(directories)
        total_size_bytes = sum(d.current_size_bytes for d in directories)
        total_max_size_bytes = sum(d.max_size_bytes for d in directories if d.max_size_bytes)
        
        org_count = len([d for d in directories if d.owner_type == DirectoryType.ORGANIZATION])
        user_count = len([d for d in directories if d.owner_type == DirectoryType.USER])
        
        return {
            "total_directories": total_directories,
            "organization_directories": org_count,
            "user_directories": user_count,
            "total_size_bytes": total_size_bytes,
            "total_max_size_bytes": total_max_size_bytes,
            "usage_percentage": (total_size_bytes / total_max_size_bytes * 100) if total_max_size_bytes > 0 else None,
            "average_size_bytes": total_size_bytes / total_directories if total_directories > 0 else 0
        }
    
    async def list_directories(
        self,
        session: Session,
        owner_type: Optional[DirectoryType] = None,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """
        List storage directories
        
        Args:
            owner_type: Filter by owner type (optional)
            include_inactive: Include inactive directories
            session: Database session
            
        Returns:
            List of directory information
        """
        
        # Build query
        query = select(StorageDirectory)
        if owner_type:
            query = query.where(StorageDirectory.owner_type == owner_type)
        if not include_inactive:
            query = query.where(StorageDirectory.is_active == True)
        
        directories = session.exec(query).all()
        
        return [
            {
                "id": str(directory.id),
                "name": directory.name,
                "description": directory.description,
                "owner_type": directory.owner_type,
                "owner_id": str(directory.owner_id),
                "root_path": directory.root_path,
                "max_size_bytes": directory.max_size_bytes,
                "current_size_bytes": directory.current_size_bytes,
                "usage_percentage": (directory.current_size_bytes / directory.max_size_bytes * 100) if directory.max_size_bytes else None,
                "is_active": directory.is_active,
                "created_at": directory.created_at.isoformat() if directory.created_at else None
            }
            for directory in directories
        ]
    
    async def deactivate_directory(
        self,
        directory_id: uuid.UUID,
        session: Session,
        updated_by_user_id: Optional[uuid.UUID] = None
    ) -> None:
        """
        Deactivate storage directory (does not delete physical files)
        
        Args:
            directory_id: Directory ID
            updated_by_user_id: Updater user ID
            session: Database session
            
        Raises:
            ValueError: Directory not found
        """
        
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        with audit_context(updated_by_user_id):
            directory.is_active = False
            directory.set_audit_fields_for_update()
            
            session.add(directory)
            session.commit()
    
    def calculate_directory_size(self, directory_path: str) -> int:
        """
        Calculate actual size of directory on disk
        
        Args:
            directory_path: Path to directory
            
        Returns:
            Size in bytes
        """
        total_size = 0
        try:
            for dirpath, dirnames, filenames in os.walk(directory_path):
                for filename in filenames:
                    file_path = os.path.join(dirpath, filename)
                    if os.path.exists(file_path):
                        total_size += os.path.getsize(file_path)
        except (OSError, IOError):
            # Handle permission errors or missing directories
            pass
        
        return total_size
    
    async def list_directory_contents(
        self,
        directory_id: uuid.UUID,
        session: Session,
        path: str = "",
        user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        List contents of a directory path
        
        Args:
            directory_id: Storage directory ID
            path: Relative path within the directory (default: root)
            user_id: User requesting access (for permission validation)
            session: Database session
            
        Returns:
            Dict containing directory contents
            
        Raises:
            ValueError: Directory not found or access denied
        """
        
        # Get directory record
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        if not directory.is_active:
            raise ValueError("Directory is not active")
        
        # Validate user has access to this directory
        if user_id:
            has_access = await self._validate_user_access(directory, user_id, session)
            if not has_access:
                raise ValueError("Access denied to this directory")
        
        # Construct full path
        safe_path = self._sanitize_path(path)
        full_path = Path(directory.root_path) / safe_path
        
        # Security check: ensure path is within directory bounds
        if not self._is_path_safe(full_path, directory.root_path):
            raise ValueError("Invalid path: outside directory bounds")
        
        if not full_path.exists():
            raise ValueError(f"Path not found: {safe_path}")
        
        if not full_path.is_dir():
            raise ValueError(f"Path is not a directory: {safe_path}")
        
        # List directory contents
        contents = []
        try:
            for item in full_path.iterdir():
                item_stat = item.stat()
                contents.append({
                    "name": item.name,
                    "type": "directory" if item.is_dir() else "file",
                    "size": item_stat.st_size if item.is_file() else None,
                    "modified_at": item_stat.st_mtime,
                    "path": str(Path(safe_path) / item.name) if safe_path else item.name
                })
        except PermissionError:
            raise ValueError("Permission denied to read directory")
        
        return {
            "directory_id": str(directory_id),
            "directory_name": directory.name,
            "current_path": safe_path,
            "contents": sorted(contents, key=lambda x: (x["type"] == "file", x["name"].lower()))
        }
    
    async def get_user_accessible_directories(
        self,
        user_id: uuid.UUID,
        session: Session
    ) -> List[Dict[str, Any]]:
        """
        Get all directories that a user has access to
        (their own directory + organization directories)
        
        Args:
            user_id: User ID
            session: Database session
            
        Returns:
            List of accessible directories
        """
        
        # Get user info
        user = session.get(User, user_id)
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        accessible_dirs = []
        
        # 1. User's own directory
        user_dir = await self.get_root_directory(
            DirectoryType.USER, user_id, session
        )
        if user_dir:
            accessible_dirs.append({
                "id": user_dir["id"],
                "name": user_dir["name"],
                "type": "user",
                "owner_name": user.full_name,
                "description": user_dir["description"],
                "current_size_bytes": user_dir["current_size_bytes"],
                "max_size_bytes": user_dir["max_size_bytes"]
            })
        
        # 2. Organization directories (current organization and parent organizations)
        org_ids = await self._get_user_organization_hierarchy(user, session)
        
        for org_id in org_ids:
            org_dir = await self.get_root_directory(
                DirectoryType.ORGANIZATION, org_id, session
            )
            if org_dir:
                org = session.get(Team, org_id)
                accessible_dirs.append({
                    "id": org_dir["id"],
                    "name": org_dir["name"],
                    "type": "organization",
                    "owner_name": org.name if org else "Unknown Organization",
                    "description": org_dir["description"],
                    "current_size_bytes": org_dir["current_size_bytes"],
                    "max_size_bytes": org_dir["max_size_bytes"]
                })
        
        return accessible_dirs
    
    def _sanitize_path(self, path: str) -> str:
        """Sanitize path to prevent directory traversal attacks"""
        if not path:
            return ""
        
        # Remove dangerous characters and sequences
        path = path.replace("\\", "/")  # Normalize separators
        path = path.strip("/")  # Remove leading/trailing slashes
        
        # Split and filter out dangerous components
        components = []
        for component in path.split("/"):
            component = component.strip()
            if component and component != "." and component != "..":
                components.append(component)
        
        return "/".join(components)
    
    def _is_path_safe(self, full_path: Path, root_path: str) -> bool:
        """Check if path is within the allowed root directory"""
        try:
            # Resolve both paths to handle symbolic links and relative paths
            resolved_full = full_path.resolve()
            resolved_root = Path(root_path).resolve()
            
            # Check if full_path is within root_path
            return resolved_full.is_relative_to(resolved_root)
        except (OSError, ValueError):
            return False
    
    async def _validate_user_access(
        self,
        directory: StorageDirectory,
        user_id: uuid.UUID,
        session: Session
    ) -> bool:
        """
        Validate if user has access to the directory
        
        Args:
            directory: Storage directory
            user_id: User ID
            session: Database session
            
        Returns:
            True if user has access, False otherwise
        """
        
        # User can access their own directory
        if directory.owner_type == DirectoryType.USER and directory.owner_id == user_id:
            return True
        
        # User can access organization directories they belong to
        if directory.owner_type == DirectoryType.ORGANIZATION:
            user = session.get(User, user_id)
            if not user:
                return False
            
            # Get user's organization hierarchy
            org_ids = await self._get_user_organization_hierarchy(user, session)
            return directory.owner_id in org_ids
        
        return False
    
    async def _get_user_organization_hierarchy(
        self,
        user: User,
        session: Session
    ) -> List[uuid.UUID]:
        """
        Get all organization IDs that user has access to
        (current organization and all parent organizations)
        
        Args:
            user: User object
            session: Database session
            
        Returns:
            List of organization IDs
        """
        
        org_ids = []
        
        if not user.team_id:
            return org_ids
        
        # Start with user's current organization
        current_org_id = user.team_id
        visited = set()
        
        # Traverse up the organization hierarchy
        while current_org_id and current_org_id not in visited:
            visited.add(current_org_id)
            org_ids.append(current_org_id)
            
            # Get parent organization
            org = session.get(Team, current_org_id)
            if org and org.parent_team_id:
                current_org_id = org.parent_team_id
            else:
                break
        
        return org_ids
    
    async def get_root_directory_by_id(
        self,
        directory_id: uuid.UUID,
        session: Session
    ) -> Optional[Dict[str, Any]]:
        """Get directory by ID"""
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            return None
        
        return {
            "id": str(directory.id),
            "name": directory.name,
            "description": directory.description,
            "owner_type": directory.owner_type,
            "owner_id": str(directory.owner_id),
            "root_path": directory.root_path,
            "max_size_bytes": directory.max_size_bytes,
            "current_size_bytes": directory.current_size_bytes,
            "is_active": directory.is_active,
            "created_at": directory.created_at.isoformat() if directory.created_at else None,
            "updated_at": directory.updated_at.isoformat() if directory.updated_at else None
        }
    
    async def _validate_user_access_by_id(
        self,
        directory_id: uuid.UUID,
        user_id: uuid.UUID,
        session: Session
    ) -> bool:
        """Validate user access by directory ID"""
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            return False
        
        return await self._validate_user_access(directory, user_id, session)
    
    async def create_folder(
        self,
        directory_id: uuid.UUID,
        folder_name: str,
        path: str = "",
        user_id: Optional[uuid.UUID] = None,
        session: Session = None
    ) -> Dict[str, Any]:
        """
        Create a new folder in the directory
        
        Args:
            directory_id: Storage directory ID
            folder_name: Name of the folder to create
            path: Relative path within the directory where to create the folder
            user_id: User creating the folder (for permission validation)
            session: Database session
            
        Returns:
            Dict containing folder creation info
            
        Raises:
            ValueError: Invalid folder name, path, or access denied
        """
        
        # Get directory record
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        if not directory.is_active:
            raise ValueError("Directory is not active")
        
        # Validate user has access to this directory
        if user_id:
            has_access = await self._validate_user_access(directory, user_id, session)
            if not has_access:
                raise ValueError("Access denied to this directory")
        
        # Validate folder name
        if not folder_name or not folder_name.strip():
            raise ValueError("Folder name cannot be empty")
        
        folder_name = folder_name.strip()
        
        # Check for invalid characters
        invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        if any(char in folder_name for char in invalid_chars):
            raise ValueError(f"Folder name contains invalid characters: {invalid_chars}")
        
        # Construct full path
        safe_path = self._sanitize_path(path)
        parent_full_path = Path(directory.root_path) / safe_path
        new_folder_path = parent_full_path / folder_name
        
        # Security check: ensure path is within directory bounds
        if not self._is_path_safe(new_folder_path, directory.root_path):
            raise ValueError("Invalid path: outside directory bounds")
        
        # Check if parent directory exists
        if not parent_full_path.exists():
            raise ValueError(f"Parent path not found: {safe_path}")
        
        if not parent_full_path.is_dir():
            raise ValueError(f"Parent path is not a directory: {safe_path}")
        
        # Check if folder already exists
        if new_folder_path.exists():
            raise ValueError(f"Folder '{folder_name}' already exists")
        
        # Create the folder
        try:
            new_folder_path.mkdir(parents=False, exist_ok=False)
        except PermissionError:
            raise ValueError("Permission denied to create folder")
        except OSError as e:
            raise ValueError(f"Failed to create folder: {e}")
        
        # Calculate new relative path
        new_relative_path = str(Path(safe_path) / folder_name) if safe_path else folder_name
        
        return {
            "message": "Folder created successfully",
            "folder_name": folder_name,
            "path": new_relative_path,
            "parent_path": safe_path,
            "full_path": str(new_folder_path),
            "directory_id": str(directory_id)
        }
    
    async def upload_file(
        self,
        directory_id: uuid.UUID,
        file_name: str,
        file_content: bytes,
        path: str = "",
        user_id: Optional[uuid.UUID] = None,
        session: Session = None,
        overwrite: bool = False
    ) -> Dict[str, Any]:
        """
        Upload a file to the directory
        
        Args:
            directory_id: Storage directory ID
            file_name: Name of the file
            file_content: File content as bytes
            path: Relative path within the directory where to upload
            user_id: User uploading the file (for permission validation)
            session: Database session
            overwrite: Whether to overwrite existing file
            
        Returns:
            Dict containing file upload info
            
        Raises:
            ValueError: Invalid file name, path, or access denied
        """
        
        # Get directory record
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        if not directory.is_active:
            raise ValueError("Directory is not active")
        
        # Validate user has access to this directory
        if user_id:
            has_access = await self._validate_user_access(directory, user_id, session)
            if not has_access:
                raise ValueError("Access denied to this directory")
        
        # Validate file name
        if not file_name or not file_name.strip():
            raise ValueError("File name cannot be empty")
        
        file_name = file_name.strip()
        
        # Check for invalid characters
        invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        if any(char in file_name for char in invalid_chars):
            raise ValueError(f"File name contains invalid characters: {invalid_chars}")
        
        # Construct full path
        safe_path = self._sanitize_path(path)
        parent_full_path = Path(directory.root_path) / safe_path
        new_file_path = parent_full_path / file_name
        
        # Security check: ensure path is within directory bounds
        if not self._is_path_safe(new_file_path, directory.root_path):
            raise ValueError("Invalid path: outside directory bounds")
        
        # Check if parent directory exists
        if not parent_full_path.exists():
            raise ValueError(f"Parent path not found: {safe_path}")
        
        if not parent_full_path.is_dir():
            raise ValueError(f"Parent path is not a directory: {safe_path}")
        
        # Check if file already exists
        if new_file_path.exists() and not overwrite:
            raise ValueError(f"File '{file_name}' already exists. Use overwrite=True to replace it.")
        
        # Check storage quota before upload
        file_size = len(file_content)
        if directory.max_size_bytes:
            current_size = self.calculate_directory_size(directory.root_path)
            if current_size + file_size > directory.max_size_bytes:
                raise ValueError(f"Upload would exceed storage quota. Available: {directory.max_size_bytes - current_size} bytes")
        
        # Write the file
        try:
            with open(new_file_path, 'wb') as f:
                f.write(file_content)
        except PermissionError:
            raise ValueError("Permission denied to write file")
        except OSError as e:
            raise ValueError(f"Failed to write file: {e}")
        
        # Update directory usage
        new_size = self.calculate_directory_size(directory.root_path)
        await self.update_directory_usage(
            directory_id=directory_id,
            new_size_bytes=new_size,
            session=session,
            updated_by_user_id=user_id
        )
        
        # Calculate new relative path
        new_relative_path = str(Path(safe_path) / file_name) if safe_path else file_name
        
        return {
            "message": "File uploaded successfully",
            "file_name": file_name,
            "path": new_relative_path,
            "parent_path": safe_path,
            "file_size": file_size,
            "full_path": str(new_file_path),
            "directory_id": str(directory_id),
            "overwritten": new_file_path.exists() and overwrite
        }
    
    async def delete_item(
        self,
        directory_id: uuid.UUID,
        item_path: str,
        user_id: Optional[uuid.UUID] = None,
        session: Session = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Delete a file or folder from the directory
        
        Args:
            directory_id: Storage directory ID
            item_path: Relative path of the item to delete
            user_id: User deleting the item (for permission validation)
            session: Database session
            force: Force delete non-empty directories
            
        Returns:
            Dict containing deletion info
            
        Raises:
            ValueError: Item not found, path invalid, or access denied
        """
        
        # Get directory record
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        if not directory.is_active:
            raise ValueError("Directory is not active")
        
        # Validate user has access to this directory
        if user_id:
            has_access = await self._validate_user_access(directory, user_id, session)
            if not has_access:
                raise ValueError("Access denied to this directory")
        
        # Validate item path
        if not item_path or not item_path.strip():
            raise ValueError("Item path cannot be empty")
        
        # Construct full path
        safe_path = self._sanitize_path(item_path)
        full_item_path = Path(directory.root_path) / safe_path
        
        # Security check: ensure path is within directory bounds
        if not self._is_path_safe(full_item_path, directory.root_path):
            raise ValueError("Invalid path: outside directory bounds")
        
        # Check if item exists
        if not full_item_path.exists():
            raise ValueError(f"Item not found: {safe_path}")
        
        # Prevent deletion of root directory
        if full_item_path.samefile(Path(directory.root_path)):
            raise ValueError("Cannot delete root directory")
        
        item_type = "directory" if full_item_path.is_dir() else "file"
        item_size = 0
        
        try:
            if full_item_path.is_file():
                item_size = full_item_path.stat().st_size
                full_item_path.unlink()
            elif full_item_path.is_dir():
                if not force and any(full_item_path.iterdir()):
                    raise ValueError("Directory is not empty. Use force=True to delete non-empty directories.")
                
                # Calculate size before deletion
                item_size = sum(f.stat().st_size for f in full_item_path.rglob('*') if f.is_file())
                
                # Delete directory and all contents
                import shutil
                shutil.rmtree(full_item_path)
        except PermissionError:
            raise ValueError("Permission denied to delete item")
        except OSError as e:
            raise ValueError(f"Failed to delete item: {e}")
        
        # Update directory usage
        new_size = self.calculate_directory_size(directory.root_path)
        await self.update_directory_usage(
            directory_id=directory_id,
            new_size_bytes=new_size,
            session=session,
            updated_by_user_id=user_id
        )
        
        return {
            "message": f"{item_type.capitalize()} deleted successfully",
            "item_path": safe_path,
            "item_type": item_type,
            "item_size": item_size,
            "directory_id": str(directory_id)
        }
    
    async def rename_item(
        self,
        directory_id: uuid.UUID,
        old_path: str,
        new_name: str,
        user_id: Optional[uuid.UUID] = None,
        session: Session = None
    ) -> Dict[str, Any]:
        """
        Rename a file or folder in the directory
        
        Args:
            directory_id: Storage directory ID
            old_path: Current relative path of the item
            new_name: New name for the item
            user_id: User renaming the item (for permission validation)
            session: Database session
            
        Returns:
            Dict containing rename info
            
        Raises:
            ValueError: Item not found, invalid name, or access denied
        """
        
        # Get directory record
        directory = session.get(StorageDirectory, directory_id)
        if not directory:
            raise ValueError(f"Directory not found: {directory_id}")
        
        if not directory.is_active:
            raise ValueError("Directory is not active")
        
        # Validate user has access to this directory
        if user_id:
            has_access = await self._validate_user_access(directory, user_id, session)
            if not has_access:
                raise ValueError("Access denied to this directory")
        
        # Validate new name
        if not new_name or not new_name.strip():
            raise ValueError("New name cannot be empty")
        
        new_name = new_name.strip()
        
        # Check for invalid characters
        invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        if any(char in new_name for char in invalid_chars):
            raise ValueError(f"New name contains invalid characters: {invalid_chars}")
        
        # Construct paths
        safe_old_path = self._sanitize_path(old_path)
        old_full_path = Path(directory.root_path) / safe_old_path
        
        # Security check: ensure path is within directory bounds
        if not self._is_path_safe(old_full_path, directory.root_path):
            raise ValueError("Invalid path: outside directory bounds")
        
        # Check if item exists
        if not old_full_path.exists():
            raise ValueError(f"Item not found: {safe_old_path}")
        
        # Prevent renaming root directory
        if old_full_path.samefile(Path(directory.root_path)):
            raise ValueError("Cannot rename root directory")
        
        # Construct new path
        parent_path = old_full_path.parent
        new_full_path = parent_path / new_name
        
        # Check if new name already exists
        if new_full_path.exists():
            raise ValueError(f"Item with name '{new_name}' already exists")
        
        item_type = "directory" if old_full_path.is_dir() else "file"
        
        try:
            old_full_path.rename(new_full_path)
        except PermissionError:
            raise ValueError("Permission denied to rename item")
        except OSError as e:
            raise ValueError(f"Failed to rename item: {e}")
        
        # Calculate new relative path
        new_relative_path = str(new_full_path.relative_to(Path(directory.root_path)))
        
        return {
            "message": f"{item_type.capitalize()} renamed successfully",
            "old_path": safe_old_path,
            "new_path": new_relative_path,
            "old_name": old_full_path.name,
            "new_name": new_name,
            "item_type": item_type,
            "directory_id": str(directory_id)
        }