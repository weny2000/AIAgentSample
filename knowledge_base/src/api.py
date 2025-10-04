"""
FastAPI application for RAG knowledge base.
"""

import asyncio
import logging
from typing import Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from .config import ConfigManager
from .factory import ServiceFactory
from .core.models import (
    QueryRequest, QueryResponse, IngestionRequest, IngestionResponse,
    TaskStatusResponse, Document
)
from .abstractions import SourceType
from .core.query_engine import QueryEngine
from .services import UploadService, ProcessingService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global services
services: Dict[str, Any] = {}
query_engine: QueryEngine = None
upload_service: UploadService = None
processing_service: ProcessingService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    global services, query_engine, upload_service, processing_service
    
    try:
        # Load configuration
        config_manager = ConfigManager()
        config = config_manager.load_config()
        
        # Initialize services
        factory = ServiceFactory(config)
        services = await factory.initialize_all_services()
        
        # Initialize query engine
        query_engine = QueryEngine(
            embedding_provider=services['embedding_provider'],
            vector_database=services['vector_database'],
            tagging_provider=services.get('tagging_provider')  # Add tagging service
        )
        
        # Initialize upload service
        upload_service = UploadService(
            storage_provider=services['storage_provider'],
            state_manager=services['state_manager']
        )
        
        # Initialize processing service
        processing_service = ProcessingService(
            embedding_provider=services['embedding_provider'],
            vector_database=services['vector_database'],
            storage_provider=services['storage_provider'],
            state_manager=services['state_manager'],
            tagging_provider=services.get('tagging_provider')  # Add tagging service
        )
        
        logger.info("Application startup completed")
        yield
        
    except Exception as e:
        logger.error(f"Application startup failed: {e}")
        raise
    finally:
        logger.info("Application shutdown")
        # Clean up resources if needed


# Create FastAPI app
app = FastAPI(
    title="RAG Knowledge Base API",
    description="A configurable RAG (Retrieval-Augmented Generation) knowledge base with AWS/local service support",
    version="1.1.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on your needs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "RAG Knowledge Base API", "version": "1.1.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Check if services are initialized
        if not services:
            raise HTTPException(status_code=503, detail="Services not initialized")
            
        return {
            "status": "healthy",
            "services": {
                "embedding_provider": "initialized" if services.get('embedding_provider') else "not_initialized",
                "vector_database": "initialized" if services.get('vector_database') else "not_initialized",
                "storage_provider": "initialized" if services.get('storage_provider') else "not_initialized",
                "task_queue": "initialized" if services.get('task_queue') else "not_initialized",
                "state_manager": "initialized" if services.get('state_manager') else "not_initialized",
                "workflow_orchestrator": "initialized" if services.get('workflow_orchestrator') else "not_initialized",
                "tagging_provider": "initialized" if services.get('tagging_provider') else "not_initialized"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Health check failed: {str(e)}")


@app.post("/api/v1/documents/ingest", response_model=IngestionResponse)
async def ingest_document(
    background_tasks: BackgroundTasks,
    request: IngestionRequest
):
    """Ingest a document for processing."""
    try:
        if not services.get('workflow_orchestrator'):
            raise HTTPException(status_code=503, detail="Workflow orchestrator not available")
        
        workflow_orchestrator = services['workflow_orchestrator']
        
        # For URL ingestion, we need to fetch content first
        if request.source_type == SourceType.URL and request.url:
            # This is a simplified version - in production you'd want proper URL fetching
            import uuid
            doc_id = str(uuid.uuid4())
            
            # Create document object for URL
            document = Document(
                id=doc_id,
                title=request.title or f"Document from {request.url}",
                content=f"Content from URL: {request.url}",  # Placeholder - should fetch actual content
                source_type=request.source_type,
                source_location=request.url,
                author=request.author,
                tags=request.tags,
                metadata=request.metadata
            )
        else:
            raise HTTPException(status_code=400, detail="URL is required for URL ingestion")
        
        # Start ingestion task in background
        background_tasks.add_task(
            _process_document_async,
            document,
            document.id
        )
        
        return IngestionResponse(
            task_id=document.id,
            status="queued",
            message="Document queued for processing"
        )
        
    except Exception as e:
        logger.error(f"Document ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/v1/documents/upload", response_model=IngestionResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    metadata: str = "{}"
):
    """Upload and ingest a document file."""
    try:
        if not upload_service:
            raise HTTPException(status_code=503, detail="Upload service not available")
        
        if not services.get('workflow_orchestrator'):
            raise HTTPException(status_code=503, detail="Workflow orchestrator not available")
        
        # Use UploadService to handle file upload
        document, task_id = await upload_service.process_file_upload(file, metadata)
        
        # Start background task for document processing (vectorization, indexing, etc.)
        background_tasks.add_task(
            _process_document_async,
            document,
            task_id
        )
        
        return IngestionResponse(
            task_id=task_id,
            status="queued", 
            message=f"File '{file.filename}' uploaded successfully and queued for processing"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/api/v1/query", response_model=QueryResponse)
async def query_knowledge_base(request: QueryRequest):
    """Query the knowledge base."""
    try:
        if not query_engine:
            raise HTTPException(status_code=503, detail="Query engine not available")
        
        # Execute query
        response = await query_engine.query(request)
        return response
        

        
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.get("/api/v1/tasks/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get the status of a processing task."""
    try:
        if not services.get('state_manager'):
            raise HTTPException(status_code=503, detail="State manager not available")
        
        state_manager = services['state_manager']
        
        # Get task status from task records
        task_info = await state_manager.get_task_status(task_id)
        
        if not task_info:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Convert status format: QUEUED -> queued
        status_mapping = {
            'QUEUED': 'queued',
            'PROCESSING': 'processing',
            'SUCCESS': 'success',
            'FAILED': 'failed'
        }
        status = status_mapping.get(task_info.get('status', ''), 'queued')
        
        # Process time fields
        from datetime import datetime
        created_at = task_info.get('created_at')
        updated_at = task_info.get('updated_at')
        
        # Convert string to datetime object if needed
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
        
        return TaskStatusResponse(
            task_id=task_id,
            status=status,
            created_at=created_at or datetime.now(),
            updated_at=updated_at or datetime.now(),
            error_message=task_info.get("error_message"),
            result_data=task_info.get("result_data"),
            metadata=task_info.get("metadata", {})
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Task status check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


@app.get("/api/v1/documents")
async def list_documents(
    limit: int = 100,
    offset: int = 0,
    source: str = None
):
    """List ingested documents."""
    try:
        if not services.get('state_manager'):
            raise HTTPException(status_code=503, detail="State manager not available")
        
        state_manager = services['state_manager']
        
        # Get document list from state
        document_keys = await state_manager.list_keys("document:")
        
        # Apply filtering and pagination
        documents = []
        for key in document_keys[offset:offset + limit]:
            doc_info = await state_manager.get_state(key)
            if doc_info:
                if source is None or doc_info.get("source") == source:
                    documents.append(doc_info)
        
        return {
            "documents": documents,
            "total": len(document_keys),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Document listing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document listing failed: {str(e)}")


@app.delete("/api/v1/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document and its associated data."""
    try:
        if not all(k in services for k in ['state_manager', 'vector_database', 'storage_provider']):
            raise HTTPException(status_code=503, detail="Required services not available")
        
        state_manager = services['state_manager']
        vector_database = services['vector_database']
        storage_provider = services['storage_provider']
        
        # Get document info
        doc_info = await state_manager.get_state(f"document:{document_id}")
        if not doc_info:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete from vector database
        chunk_ids = doc_info.get("chunk_ids", [])
        if chunk_ids:
            await vector_database.delete_vectors(chunk_ids)
        
        # Delete stored files
        file_paths = doc_info.get("file_paths", [])
        for file_path in file_paths:
            try:
                await storage_provider.delete_file(file_path)
            except FileNotFoundError:
                pass  # File already deleted
        
        # Delete from state manager
        await state_manager.delete_state(f"document:{document_id}")
        
        return {"message": f"Document {document_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document deletion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


async def _process_document_async(document: Document, task_id: str):
    """Background task to process document using ProcessingService."""
    if not processing_service:
        logger.error(f"ProcessingService not available for task {task_id}")
        return
        
    try:
        success = await processing_service.process_document_async(document, task_id)
        if success:
            logger.info(f"Document {document.id} processed successfully via ProcessingService (task: {task_id})")
        else:
            logger.error(f"Document processing failed via ProcessingService (task: {task_id})")
            
    except Exception as e:
        logger.error(f"Document processing error for {document.id} (task: {task_id}): {e}")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


def run_server(host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
    """Run the FastAPI server."""
    uvicorn.run(
        "knowledge_base.src.api:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )


if __name__ == "__main__":
    run_server()