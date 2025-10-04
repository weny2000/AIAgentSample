"""
Service factory for creating appropriate adapters based on configuration.
"""

import logging
from typing import Dict, Any

from src.abstractions import (
    EmbeddingProvider, VectorDatabase, StorageProvider,
    TaskQueue, StateManager, WorkflowOrchestrator, TaggingProvider
)
from src.adapters.local import (
    LocalEmbeddingProvider, LocalVectorDatabase, LocalStorageProvider,
    LocalTaskQueue, LocalStateManager
)
from src.adapters.postgresql import PostgreSQLStateManager
from src.adapters.aws import (
    BedrockEmbeddingProvider, OpenSearchVectorDatabase, S3StorageProvider,
    SQSTaskQueue, DynamoDBStateManager
)
from src.core.workflow import LocalWorkflowOrchestrator
from src.services import LocalTaggingService

logger = logging.getLogger(__name__)


class ServiceFactory:
    """Factory for creating service adapters based on configuration."""
    
    def __init__(self, config):
        """Initialize factory with AppConfig object."""
        self.config = config
        
    def create_embedding_provider(self) -> EmbeddingProvider:
        """Create embedding provider based on configuration."""
        embedding_config = self.config.embedding
        provider_type = embedding_config.provider
        
        if provider_type == 'local':
            model_name = getattr(embedding_config, 'model_name', 'all-MiniLM-L6-v2')
            return LocalEmbeddingProvider(model_name=model_name)
            
        elif provider_type == 'aws':
            region_name = getattr(embedding_config, 'region_name', 'us-east-1')
            model_id = getattr(embedding_config, 'model_id', 'amazon.titan-embed-text-v1')
            return BedrockEmbeddingProvider(region_name=region_name, model_id=model_id)
            
        else:
            raise ValueError(f"Unknown embedding provider type: {provider_type}")
    
    def create_vector_database(self) -> VectorDatabase:
        """Create vector database based on configuration."""
        db_config = self.config.vector_database
        db_type = db_config.provider
        
        if db_type in ['local', 'chromadb']:
            persist_directory = getattr(db_config, 'persist_directory', './chroma_db')
            return LocalVectorDatabase(persist_directory=persist_directory)
            
        elif db_type == 'aws':
            endpoint = getattr(db_config, 'endpoint', None)
            if not endpoint:
                raise ValueError("OpenSearch endpoint is required for AWS vector database")
            region_name = getattr(db_config, 'region_name', 'us-east-1')
            index_name = getattr(db_config, 'index_name', 'knowledge-base')
            return OpenSearchVectorDatabase(
                endpoint=endpoint,
                region_name=region_name,
                index_name=index_name
            )
            
        else:
            raise ValueError(f"Unknown vector database type: {db_type}")
    
    def create_storage_provider(self) -> StorageProvider:
        """Create storage provider based on configuration."""
        storage_config = self.config.storage
        storage_type = storage_config.provider
        
        if storage_type == 'local':
            base_path = getattr(storage_config, 'base_path', './storage')
            return LocalStorageProvider(base_path=base_path)
            
        elif storage_type == 'aws':
            bucket_name = getattr(storage_config, 'bucket_name', None)
            if not bucket_name:
                raise ValueError("S3 bucket name is required for AWS storage")
            region_name = getattr(storage_config, 'region_name', 'us-east-1')
            prefix = getattr(storage_config, 'prefix', '')
            return S3StorageProvider(
                bucket_name=bucket_name,
                region_name=region_name,
                prefix=prefix
            )
            
        else:
            raise ValueError(f"Unknown storage provider type: {storage_type}")
    
    def create_task_queue(self) -> TaskQueue:
        """Create task queue based on configuration."""
        queue_config = self.config.task_queue
        queue_type = queue_config.provider
        
        if queue_type in ['local', 'redis']:
            redis_url = getattr(queue_config, 'redis_url', 'redis://localhost:6379/0')
            return LocalTaskQueue(redis_url=redis_url)
            
        elif queue_type == 'aws':
            queue_url = getattr(queue_config, 'queue_url', None)
            if not queue_url:
                raise ValueError("SQS queue URL is required for AWS task queue")
            region_name = getattr(queue_config, 'region_name', 'us-east-1')
            return SQSTaskQueue(queue_url=queue_url, region_name=region_name)
            
        else:
            raise ValueError(f"Unknown task queue type: {queue_type}")
    
    def create_state_manager(self) -> StateManager:
        """Create state manager based on configuration."""
        state_config = self.config.state_manager
        state_type = state_config.provider
        
        if state_type == 'local':
            db_path = getattr(state_config, 'db_path', './state.db')
            return LocalStateManager(db_path=db_path)
            
        elif state_type == 'postgresql':
            database_url = getattr(state_config, 'database_url', None)
            if not database_url:
                raise ValueError("Database URL is required for PostgreSQL state manager")
            return PostgreSQLStateManager(database_url=database_url)
            
        elif state_type == 'aws':
            table_name = getattr(state_config, 'table_name', None)
            if not table_name:
                raise ValueError("DynamoDB table name is required for AWS state manager")
            region_name = getattr(state_config, 'region_name', 'us-east-1')
            return DynamoDBStateManager(table_name=table_name, region_name=region_name)
            
        else:
            raise ValueError(f"Unknown state manager type: {state_type}")
    
    def create_workflow_orchestrator(self) -> WorkflowOrchestrator:
        """Create workflow orchestrator based on configuration."""
        workflow_config = self.config.workflow
        workflow_type = workflow_config.provider
        
        if workflow_type == 'local':
            # Create all required services
            embedding_provider = self.create_embedding_provider()
            vector_database = self.create_vector_database()
            storage_provider = self.create_storage_provider()
            state_manager = self.create_state_manager()
            
            return LocalWorkflowOrchestrator(
                embedding_provider=embedding_provider,
                vector_database=vector_database,
                storage_provider=storage_provider,
                state_manager=state_manager
            )
            
        elif workflow_type == 'aws':
            # For AWS, we could use Step Functions, but for now use local orchestrator
            # with AWS services
            embedding_provider = self.create_embedding_provider()
            vector_database = self.create_vector_database()
            storage_provider = self.create_storage_provider()
            state_manager = self.create_state_manager()
            
            return LocalWorkflowOrchestrator(
                embedding_provider=embedding_provider,
                vector_database=vector_database,
                storage_provider=storage_provider,
                state_manager=state_manager
            )
            
        else:
            raise ValueError(f"Unknown workflow orchestrator type: {workflow_type}")
    
    def create_tagging_provider(self) -> TaggingProvider:
        """Create tagging provider based on configuration."""
        # For now, we only support local tagging service
        # In the future, this could be extended to support AI-based tagging services
        embedding_provider = self.create_embedding_provider()
        return LocalTaggingService(embedding_provider=embedding_provider)
    
    async def initialize_all_services(self) -> Dict[str, Any]:
        """Initialize all services and return them in a dictionary."""
        logger.info("Initializing all services...")
        
        # Create all services
        embedding_provider = self.create_embedding_provider()
        vector_database = self.create_vector_database()
        storage_provider = self.create_storage_provider()
        task_queue = self.create_task_queue()
        state_manager = self.create_state_manager()
        workflow_orchestrator = self.create_workflow_orchestrator()
        tagging_provider = self.create_tagging_provider()
        
        # Initialize services that require initialization
        await embedding_provider.initialize()
        await vector_database.initialize()
        await task_queue.initialize()
        await state_manager.initialize()
        
        services = {
            'embedding_provider': embedding_provider,
            'vector_database': vector_database,
            'storage_provider': storage_provider,
            'task_queue': task_queue,
            'state_manager': state_manager,
            'workflow_orchestrator': workflow_orchestrator,
            'tagging_provider': tagging_provider
        }
        
        logger.info("All services initialized successfully")
        return services


def create_services_from_config(config: Dict[str, Any]) -> ServiceFactory:
    """Create a service factory from configuration."""
    return ServiceFactory(config)