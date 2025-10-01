"""
Storage API routes
Public API for file and directory management
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlmodel import Session
from typing import List, Optional
import uuid

from ..database.connection import get_async_session
from ..routes.auth import get_current_user_dependency
from ..services.storage_service import StorageService
from ..models.storage import DirectoryType
from ..models.user import User

# Initialize router
router = APIRouter(prefix="/api/storage", tags=["Storage"])

# Initialize storage service
storage_service = StorageService()


@router.get("/directories", response_model=List[dict])
async def get_accessible_directories(
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Get all directories accessible to the current user
    (their own directory + organization directories)
    """
    try:
        directories = await storage_service.get_user_accessible_directories(
            user_id=current_user.id,
            session=session
        )
        return directories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/directories/{directory_id}/contents")
async def list_directory_contents(
    directory_id: uuid.UUID,
    path: str = Query("", description="Relative path within the directory"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    List contents of a directory
    
    Args:
        directory_id: Storage directory ID
        path: Relative path within the directory (default: root)
    """
    try:
        contents = await storage_service.list_directory_contents(
            directory_id=directory_id,
            session=session,
            path=path,
            user_id=current_user.id
        )
        return contents
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/directories/{directory_id}")
async def get_directory_info(
    directory_id: uuid.UUID,
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Get directory information and validate user access
    """
    try:
        # Get directory from storage service
        directory = await storage_service.get_root_directory_by_id(
            directory_id=directory_id,
            session=session
        )
        
        if not directory:
            raise HTTPException(status_code=404, detail="Directory not found")
        
        # Validate access
        has_access = await storage_service._validate_user_access_by_id(
            directory_id=directory_id,
            user_id=current_user.id,
            session=session
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return directory
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/directories/{directory_id}/refresh-size")
async def refresh_directory_size(
    directory_id: uuid.UUID,
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Refresh directory size by calculating actual disk usage
    """
    try:
        # Validate access first
        has_access = await storage_service._validate_user_access_by_id(
            directory_id=directory_id,
            user_id=current_user.id,
            session=session
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get directory info
        directory = await storage_service.get_root_directory_by_id(
            directory_id=directory_id,
            session=session
        )
        
        if not directory:
            raise HTTPException(status_code=404, detail="Directory not found")
        
        # Calculate actual size
        actual_size = storage_service.calculate_directory_size(directory["root_path"])
        
        # Update size in database
        updated_info = await storage_service.update_directory_usage(
            directory_id=directory_id,
            new_size_bytes=actual_size,
            session=session,
            updated_by_user_id=current_user.id
        )
        
        return {
            "message": "Directory size refreshed successfully",
            "directory_id": str(directory_id),
            "previous_size": directory["current_size_bytes"],
            "current_size": actual_size,
            "size_difference": actual_size - directory["current_size_bytes"],
            **updated_info
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-storage")
async def get_my_storage_summary(
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Get current user's storage summary
    """
    try:
        # Get user's own directory
        user_directory = await storage_service.get_root_directory(
            owner_type=DirectoryType.USER,
            owner_id=current_user.id,
            session=session
        )
        
        # Get accessible organization directories
        org_directories = []
        accessible_dirs = await storage_service.get_user_accessible_directories(
            user_id=current_user.id,
            session=session
        )
        
        for dir_info in accessible_dirs:
            if dir_info["type"] == "organization":
                org_directories.append(dir_info)
        
        return {
            "user": {
                "id": str(current_user.id),
                "username": current_user.username,
                "full_name": current_user.full_name
            },
            "user_directory": user_directory,
            "organization_directories": org_directories,
            "total_accessible_directories": len(accessible_dirs),
            "summary": {
                "user_storage_bytes": user_directory["current_size_bytes"] if user_directory else 0,
                "total_org_storage_bytes": sum(d["current_size_bytes"] for d in org_directories),
                "total_accessible_storage_bytes": sum(d["current_size_bytes"] for d in accessible_dirs)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_storage_statistics(
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Get storage statistics (admin only for global stats, otherwise user-specific)
    """
    try:
        if current_user.role == "ADMIN":
            # Admin can see global statistics
            stats = await storage_service.get_directory_usage_stats(session=session)
            return {
                "scope": "global",
                "user": {
                    "id": str(current_user.id),
                    "username": current_user.username,
                    "role": current_user.role
                },
                **stats
            }
        else:
            # Regular users see their accessible directories stats
            accessible_dirs = await storage_service.get_user_accessible_directories(
                user_id=current_user.id,
                session=session
            )
            
            total_size = sum(d["current_size_bytes"] for d in accessible_dirs)
            total_max_size = sum(d["max_size_bytes"] for d in accessible_dirs if d["max_size_bytes"])
            
            user_dirs = [d for d in accessible_dirs if d["type"] == "user"]
            org_dirs = [d for d in accessible_dirs if d["type"] == "organization"]
            
            return {
                "scope": "user_accessible",
                "user": {
                    "id": str(current_user.id),
                    "username": current_user.username,
                    "role": current_user.role
                },
                "total_directories": len(accessible_dirs),
                "user_directories": len(user_dirs),
                "organization_directories": len(org_dirs),
                "total_size_bytes": total_size,
                "total_max_size_bytes": total_max_size,
                "usage_percentage": (total_size / total_max_size * 100) if total_max_size > 0 else None
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# File and Folder Management APIs

@router.post("/directories/{directory_id}/folders")
async def create_folder(
    directory_id: uuid.UUID,
    folder_name: str = Form(..., description="Name of the folder to create"),
    path: str = Form("", description="Relative path where to create the folder"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Create a new folder in the directory
    
    Args:
        directory_id: Storage directory ID
        folder_name: Name of the folder to create
        path: Relative path within the directory where to create the folder
    """
    try:
        result = await storage_service.create_folder(
            directory_id=directory_id,
            folder_name=folder_name,
            path=path,
            user_id=current_user.id,
            session=session
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/directories/{directory_id}/files")
async def upload_file(
    directory_id: uuid.UUID,
    file: UploadFile = File(...),
    path: str = Form("", description="Relative path where to upload the file"),
    overwrite: bool = Form(False, description="Whether to overwrite existing file"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Upload a file to the directory
    
    Args:
        directory_id: Storage directory ID
        file: File to upload
        path: Relative path within the directory where to upload
        overwrite: Whether to overwrite existing file
    """
    try:
        # Read file content
        file_content = await file.read()
        
        result = await storage_service.upload_file(
            directory_id=directory_id,
            file_name=file.filename,
            file_content=file_content,
            path=path,
            user_id=current_user.id,
            session=session,
            overwrite=overwrite
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/directories/{directory_id}/files/multiple")
async def upload_multiple_files(
    directory_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    path: str = Form("", description="Relative path where to upload the files"),
    overwrite: bool = Form(False, description="Whether to overwrite existing files"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Upload multiple files to the directory
    
    Args:
        directory_id: Storage directory ID
        files: List of files to upload
        path: Relative path within the directory where to upload
        overwrite: Whether to overwrite existing files
    """
    try:
        results = []
        errors = []
        
        for file in files:
            try:
                # Read file content
                file_content = await file.read()
                
                result = await storage_service.upload_file(
                    directory_id=directory_id,
                    file_name=file.filename,
                    file_content=file_content,
                    path=path,
                    user_id=current_user.id,
                    session=session,
                    overwrite=overwrite
                )
                results.append(result)
            except Exception as e:
                errors.append({
                    "file_name": file.filename,
                    "error": str(e)
                })
        
        return {
            "message": f"Uploaded {len(results)} files successfully",
            "successful_uploads": results,
            "failed_uploads": errors,
            "total_files": len(files),
            "success_count": len(results),
            "error_count": len(errors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/directories/{directory_id}/items")
async def delete_item(
    directory_id: uuid.UUID,
    item_path: str = Query(..., description="Relative path of the item to delete"),
    force: bool = Query(False, description="Force delete non-empty directories"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Delete a file or folder from the directory
    
    Args:
        directory_id: Storage directory ID
        item_path: Relative path of the item to delete
        force: Force delete non-empty directories
    """
    try:
        result = await storage_service.delete_item(
            directory_id=directory_id,
            item_path=item_path,
            user_id=current_user.id,
            session=session,
            force=force
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/directories/{directory_id}/items/rename")
async def rename_item(
    directory_id: uuid.UUID,
    old_path: str = Form(..., description="Current relative path of the item"),
    new_name: str = Form(..., description="New name for the item"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Rename a file or folder in the directory
    
    Args:
        directory_id: Storage directory ID
        old_path: Current relative path of the item
        new_name: New name for the item
    """
    try:
        result = await storage_service.rename_item(
            directory_id=directory_id,
            old_path=old_path,
            new_name=new_name,
            user_id=current_user.id,
            session=session
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/directories/{directory_id}/items/copy")
async def copy_item(
    directory_id: uuid.UUID,
    source_path: str = Form(..., description="Source relative path of the item"),
    destination_path: str = Form(..., description="Destination relative path"),
    new_name: Optional[str] = Form(None, description="New name for the copied item"),
    current_user: User = Depends(get_current_user_dependency),
    session: Session = Depends(get_async_session)
):
    """
    Copy a file or folder within the directory
    
    Args:
        directory_id: Storage directory ID
        source_path: Source relative path of the item
        destination_path: Destination relative path
        new_name: New name for the copied item (optional)
    """
    try:
        # Get directory record
        directory = await storage_service.get_root_directory_by_id(
            directory_id=directory_id,
            session=session
        )
        
        if not directory:
            raise HTTPException(status_code=404, detail="Directory not found")
        
        # Validate access
        has_access = await storage_service._validate_user_access_by_id(
            directory_id=directory_id,
            user_id=current_user.id,
            session=session
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # This is a simplified copy operation
        # In a full implementation, you'd want to add proper copy functionality to StorageService
        return {
            "message": "Copy functionality not yet implemented",
            "note": "This endpoint is prepared for future implementation"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))