"""
Main entry point for the RAG knowledge base package.
"""

from .config import ConfigManager
from .factory import ServiceFactory, create_services_from_config
from .core import *
from .abstractions import *
from .adapters import *

__version__ = "1.1.0"
__author__ = "AI Agent Development Team"
__description__ = "A configurable RAG knowledge base with AWS/local service support"

__all__ = [
    # Configuration
    "ConfigManager",
    
    # Factory
    "ServiceFactory", 
    "create_services_from_config",
    
    # Core models and components
    "Document",
    "DocumentChunk",
    "KnowledgeChunk", 
    "IngestionTask",
    "SearchResult",
    "QueryRequest",
    "QueryResponse",
    "IngestionRequest",
    "IngestionResponse",
    "TaskStatusResponse",
    "DocumentProcessor",
    "TextChunker",
    "LocalWorkflowOrchestrator",
    "QueryEngine",
    
    # Abstractions
    "EmbeddingProvider",
    "VectorDatabase",
    "StorageProvider",
    "TaskQueue", 
    "StateManager",
    "WorkflowOrchestrator",
    
    # Local adapters
    "LocalEmbeddingProvider",
    "LocalVectorDatabase",
    "LocalStorageProvider",
    "LocalTaskQueue",
    "LocalStateManager",
    
    # AWS adapters
    "BedrockEmbeddingProvider",
    "OpenSearchVectorDatabase", 
    "S3StorageProvider",
    "SQSTaskQueue",
    "DynamoDBStateManager"
]


def get_version():
    """Get package version."""
    return __version__


async def create_knowledge_base(config_path: str = None):
    """
    Create a complete knowledge base instance.
    
    Args:
        config_path: Path to configuration file (optional)
        
    Returns:
        Dictionary containing all initialized services
    """
    # Load configuration
    config_manager = ConfigManager()
    if config_path:
        config = await config_manager.load_config(config_path)
    else:
        config = await config_manager.load_config()
    
    # Create and initialize services
    factory = ServiceFactory(config)
    services = await factory.initialize_all_services()
    
    return services