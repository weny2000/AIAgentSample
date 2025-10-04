"""
Upload Service - responsible for handling file upload business logic
"""

import os
import json
import uuid
import logging
from typing import Dict, Any, Optional, Tuple
from fastapi import UploadFile, HTTPException

from src.core.models import Document
from src.abstractions import StorageProvider, StateManager, SourceType

logger = logging.getLogger(__name__)


class UploadService:
    """File upload service - responsible for file upload and initial processing business logic"""
    
    def __init__(
        self, 
        storage_provider: StorageProvider,
        state_manager: StateManager
    ):
        self.storage_provider = storage_provider
        self.state_manager = state_manager
        
    async def process_file_upload(
        self, 
        file: UploadFile, 
        metadata: str = "{}"
    ) -> Tuple[Document, str]:
        """
        Handle complete file upload workflow
        
        Args:
            file: Uploaded file
            metadata: JSON format metadata string
            
        Returns:
            Tuple[Document, task_id]: Created document object and task ID
        """
        try:
            # 1. Validate file
            await self._validate_file(file)
            
            # 2. Generate unique IDs
            doc_id = str(uuid.uuid4())
            task_id = str(uuid.uuid4())
            
            # 3. Parse metadata
            metadata_dict = self._parse_metadata(metadata)
            
            # 4. Read file content
            content = await file.read()
            
            # 5. Store file to filesystem
            file_path = await self._store_file(doc_id, file.filename, content)
            
            # 6. Extract file content (if it's a text file)
            text_content = await self._extract_text_content(file, content)
            
            # 7. Build document object
            document = self._create_document(
                doc_id=doc_id,
                filename=file.filename,
                content=text_content,
                file_path=file_path,
                file_size=len(content),
                content_type=file.content_type,
                metadata=metadata_dict
            )
            
            # 8. Create task record
            await self._create_task_record(task_id, doc_id, file.filename)
            
            logger.info(f"File upload processed successfully: {file.filename} -> {doc_id}")
            return document, task_id
            
        except Exception as e:
            logger.error(f"File upload processing failed: {e}")
            raise HTTPException(status_code=500, detail=f"Upload processing failed: {str(e)}")
    
    async def _validate_file(self, file: UploadFile) -> None:
        """Validate uploaded file"""
        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
            
        # Check file size limit (e.g., 50MB)
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
        file.file.seek(0, 2)  # Move to end of file
        file_size = file.file.tell()
        file.file.seek(0)  # Reset file pointer
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
            )
            
        # Check file type (can add allowed file types list)
        allowed_types = {
            'text/plain', 'text/markdown', 'text/html',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/json', 'text/csv'
        }
        
        if file.content_type not in allowed_types:
            logger.warning(f"Potentially unsupported file type: {file.content_type}")
            # Don't block, just warn
    
    def _parse_metadata(self, metadata_str: str) -> Dict[str, Any]:
        """Parse metadata JSON string"""
        try:
            metadata_dict = json.loads(metadata_str) if metadata_str else {}
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid metadata JSON: {e}")
            metadata_dict = {}
            
        # Ensure metadata is dictionary type
        if not isinstance(metadata_dict, dict):
            metadata_dict = {}
            
        return metadata_dict
    
    async def _store_file(self, doc_id: str, filename: str, content: bytes) -> str:
        """Store file to filesystem"""
        try:
            # Build storage path: uploads/doc_id/filename
            file_path = f"uploads/{doc_id}/{filename}"
            
            # Store file
            stored_path = await self.storage_provider.store_file(file_path, content)
            logger.info(f"File stored at: {stored_path}")
            return stored_path
            
        except Exception as e:
            logger.error(f"Failed to store file {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"File storage failed: {str(e)}")
    
    async def _extract_text_content(self, file: UploadFile, content: bytes) -> str:
        """Extract text content from file"""
        try:
            # Text files decode directly
            if file.content_type and file.content_type.startswith('text/'):
                return content.decode('utf-8')
            
            # JSON files
            elif file.content_type == 'application/json':
                return content.decode('utf-8')
            
            # Other file types temporarily return empty string
            # Text extraction for PDF, Word etc. can be added later
            else:
                logger.info(f"Binary file detected: {file.content_type}. Text extraction not implemented yet.")
                return f"[Binary file: {file.filename}, type: {file.content_type}, size: {len(content)} bytes]"
                
        except UnicodeDecodeError as e:
            logger.warning(f"Failed to decode file content: {e}")
            return f"[Could not decode file content: {file.filename}]"
    
    def _create_document(
        self,
        doc_id: str,
        filename: str,
        content: str,
        file_path: str,
        file_size: int,
        content_type: str,
        metadata: Dict[str, Any]
    ) -> Document:
        """Create Document object"""
        
        # Merge file information to metadata
        enhanced_metadata = {
            **metadata,
            "original_filename": filename,
            "content_type": content_type,
            "file_size": file_size,
            "file_path": file_path,
            "upload_method": "api_upload"
        }
        
        return Document(
            id=doc_id,
            title=metadata.get('title', filename),  # Use provided title or filename
            content=content,
            source_type=SourceType.FILE,
            source_location=file_path,
            original_filename=filename,
            author=metadata.get('author'),
            language=metadata.get('language'),
            tags=metadata.get('tags', []),
            metadata=enhanced_metadata
        )
    
    async def _create_task_record(self, task_id: str, doc_id: str, filename: str) -> None:
        """Create task record in state manager"""
        try:
            success = await self.state_manager.create_task_record(
                task_id=task_id,
                task_type="document_upload",
                source_location=filename,
                source_type=SourceType.FILE,
                metadata={
                    "document_id": doc_id,
                    "filename": filename,
                    "status": "uploaded",
                    "stage": "file_received"
                }
            )
            
            if not success:
                logger.error(f"Failed to create task record for {task_id}")
            else:
                logger.info(f"Task record created: {task_id}")
                
        except Exception as e:
            logger.error(f"Error creating task record: {e}")
            # Don't throw exception because file has already been uploaded successfully