"""
Service adapters for different deployment environments.
"""

from .local import (
    LocalEmbeddingProvider,
    LocalVectorDatabase, 
    LocalStorageProvider,
    LocalTaskQueue,
    LocalStateManager
)

from .aws import (
    BedrockEmbeddingProvider,
    OpenSearchVectorDatabase,
    S3StorageProvider, 
    SQSTaskQueue,
    DynamoDBStateManager
)

__all__ = [
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