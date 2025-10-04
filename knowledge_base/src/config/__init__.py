"""
Configuration management system supporting both YAML files and environment variables.
"""

import os
import yaml
from typing import Any, Dict, Optional, Union
from pathlib import Path
from pydantic import BaseModel, Field
from enum import Enum


class Environment(str, Enum):
    """Environment types"""
    LOCAL = "local"
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class EmbeddingConfig(BaseModel):
    """Embedding model configuration"""
    provider: str = Field(..., description="Provider type: 'local' or 'aws'")
    
    # Local provider settings
    model_name: Optional[str] = Field(None, description="Local model name for sentence-transformers")
    cache_folder: Optional[str] = Field(None, description="Local model cache folder")
    device: Optional[str] = Field("cpu", description="Device to run model on")
    
    # AWS provider settings
    bedrock_model_id: Optional[str] = Field(None, description="AWS Bedrock model ID")
    aws_region: Optional[str] = Field(None, description="AWS region")
    
    # Common settings
    batch_size: int = Field(32, description="Batch size for embedding generation")
    max_length: int = Field(512, description="Maximum text length for embedding")


class VectorDatabaseConfig(BaseModel):
    """Vector database configuration"""
    provider: str = Field(..., description="Provider type: 'chromadb' or 'opensearch'")
    
    # ChromaDB settings
    persist_directory: Optional[str] = Field(None, description="ChromaDB persistence directory")
    
    # OpenSearch settings
    opensearch_endpoint: Optional[str] = Field(None, description="OpenSearch endpoint URL")
    opensearch_index_prefix: Optional[str] = Field("knowledge", description="Index name prefix")
    aws_region: Optional[str] = Field(None, description="AWS region for OpenSearch")
    
    # Common settings
    default_index_name: str = Field("knowledge_base", description="Default index name")


class StorageConfig(BaseModel):
    """File storage configuration"""
    provider: str = Field(..., description="Provider type: 'local' or 's3'")
    
    # Local storage settings
    local_storage_path: Optional[str] = Field(None, description="Local storage directory")
    
    # S3 settings
    s3_bucket: Optional[str] = Field(None, description="S3 bucket name")
    s3_prefix: Optional[str] = Field("knowledge-base/", description="S3 key prefix")
    aws_region: Optional[str] = Field(None, description="AWS region")
    
    # Common settings
    max_file_size_mb: int = Field(100, description="Maximum file size in MB")


class TaskQueueConfig(BaseModel):
    """Task queue configuration"""
    provider: str = Field(..., description="Provider type: 'redis' or 'sqs'")
    
    # Redis settings
    redis_url: Optional[str] = Field("redis://localhost:6379/0", description="Redis connection URL")
    
    # SQS settings
    sqs_queue_url: Optional[str] = Field(None, description="SQS queue URL")
    aws_region: Optional[str] = Field(None, description="AWS region")
    
    # Common settings
    task_timeout: int = Field(3600, description="Task timeout in seconds")
    max_retries: int = Field(3, description="Maximum retry attempts")


class StateManagerConfig(BaseModel):
    """State manager configuration."""
    provider: str = Field(..., description="Provider type: 'local' or 'postgresql' or 'dynamodb'")
    
    # SQLite settings (local)
    db_path: Optional[str] = Field("./state.db", description="SQLite database path")
    connection_pool_size: Optional[int] = Field(5, description="Connection pool size")
    
    # PostgreSQL settings
    database_url: Optional[str] = Field(None, description="PostgreSQL connection URL")
    
    # DynamoDB settings (AWS)
    table_name: Optional[str] = Field(None, description="DynamoDB table name")
    region_name: Optional[str] = Field("us-east-1", description="AWS region")


class WorkflowConfig(BaseModel):
    """Workflow orchestration configuration"""
    provider: str = Field(..., description="Provider type: 'local' or 'stepfunctions'")
    
    # Local workflow settings
    max_concurrent_tasks: int = Field(4, description="Maximum concurrent tasks")
    
    # Step Functions settings
    state_machine_arn: Optional[str] = Field(None, description="Step Functions state machine ARN")
    aws_region: Optional[str] = Field(None, description="AWS region")
    
    # Common settings
    default_timeout: int = Field(1800, description="Default task timeout in seconds")


class ProcessingConfig(BaseModel):
    """Document processing configuration"""
    chunk_size: int = Field(1000, description="Default chunk size in characters")
    chunk_overlap: int = Field(200, description="Overlap between chunks")
    max_file_size_mb: int = Field(100, description="Maximum file size in MB")
    supported_file_types: list = Field(
        default_factory=lambda: [".pdf", ".txt", ".md", ".docx"],
        description="Supported file extensions"
    )
    
    # URL processing
    request_timeout: int = Field(30, description="HTTP request timeout in seconds")
    max_retries: int = Field(3, description="Maximum retry attempts for URL fetching")


class APIConfig(BaseModel):
    """API server configuration"""
    host: str = Field("0.0.0.0", description="API host address")
    port: int = Field(8000, description="API port number")
    workers: int = Field(1, description="Number of worker processes")
    reload: bool = Field(False, description="Enable auto-reload in development")
    log_level: str = Field("info", description="Logging level")


class AppConfig(BaseModel):
    """Main application configuration"""
    environment: Environment = Field(Environment.LOCAL, description="Application environment")
    debug: bool = Field(False, description="Enable debug mode")
    
    # Service configurations
    embedding: EmbeddingConfig
    vector_database: VectorDatabaseConfig
    storage: StorageConfig
    task_queue: TaskQueueConfig
    state_manager: StateManagerConfig
    workflow: WorkflowConfig
    processing: ProcessingConfig
    api: APIConfig = Field(default_factory=APIConfig)


class ConfigManager:
    """Configuration manager with support for YAML files and environment variables"""
    
    def __init__(self, config_file: Optional[str] = None, environment: Optional[str] = None):
        self.environment = environment or os.getenv("ENVIRONMENT", "local")
        self.config_file = config_file or self._get_default_config_file()
        self._config: Optional[AppConfig] = None
    
    def _get_default_config_file(self) -> str:
        """Get default configuration file based on environment"""
        config_dir = Path(__file__).parent.parent.parent / "config"
        return str(config_dir / f"{self.environment}.yaml")
    
    def load_config(self) -> AppConfig:
        """Load configuration from file and environment variables"""
        if self._config is not None:
            return self._config
        
        # Load base configuration from YAML file
        config_data = self._load_yaml_config()
        
        # Override with environment variables
        config_data = self._apply_env_overrides(config_data)
        
        # Create and validate configuration
        self._config = AppConfig(**config_data)
        return self._config
    
    def _load_yaml_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        config_path = Path(self.config_file)
        
        if not config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    
    def _apply_env_overrides(self, config_data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply environment variable overrides to configuration"""
        
        # Environment-specific overrides
        env_overrides = {
            # General settings
            "environment": os.getenv("ENVIRONMENT"),
            "debug": self._get_bool_env("DEBUG"),
            
            # Embedding configuration
            "embedding.provider": os.getenv("EMBEDDING_PROVIDER"),
            "embedding.model_name": os.getenv("EMBEDDING_MODEL_NAME"),
            "embedding.bedrock_model_id": os.getenv("BEDROCK_MODEL_ID"),
            "embedding.aws_region": os.getenv("AWS_REGION"),
            
            # Vector database configuration
            "vector_database.provider": os.getenv("VECTOR_DB_PROVIDER"),
            "vector_database.persist_directory": os.getenv("CHROMADB_PERSIST_DIR"),
            "vector_database.opensearch_endpoint": os.getenv("OPENSEARCH_ENDPOINT"),
            "vector_database.aws_region": os.getenv("AWS_REGION"),
            
            # Storage configuration
            "storage.provider": os.getenv("STORAGE_PROVIDER"),
            "storage.local_storage_path": os.getenv("LOCAL_STORAGE_PATH"),
            "storage.s3_bucket": os.getenv("S3_BUCKET"),
            "storage.aws_region": os.getenv("AWS_REGION"),
            
            # Task queue configuration
            "task_queue.provider": os.getenv("TASK_QUEUE_PROVIDER"),
            "task_queue.redis_url": os.getenv("REDIS_URL"),
            "task_queue.sqs_queue_url": os.getenv("SQS_QUEUE_URL"),
            "task_queue.aws_region": os.getenv("AWS_REGION"),
            
            # State manager configuration
            "state_manager.provider": os.getenv("STATE_MANAGER_PROVIDER"),
            "state_manager.sqlite_path": os.getenv("SQLITE_PATH"),
            "state_manager.postgresql_url": os.getenv("DATABASE_URL"),
            "state_manager.dynamodb_table_name": os.getenv("DYNAMODB_TABLE_NAME"),
            "state_manager.aws_region": os.getenv("AWS_REGION"),
            
            # Workflow configuration
            "workflow.provider": os.getenv("WORKFLOW_PROVIDER"),
            "workflow.state_machine_arn": os.getenv("STEP_FUNCTIONS_ARN"),
            "workflow.aws_region": os.getenv("AWS_REGION"),
            
            # API configuration
            "api.host": os.getenv("API_HOST"),
            "api.port": self._get_int_env("API_PORT"),
            "api.workers": self._get_int_env("API_WORKERS"),
            "api.reload": self._get_bool_env("API_RELOAD"),
            "api.log_level": os.getenv("LOG_LEVEL"),
        }
        
        # Apply non-None overrides
        for key, value in env_overrides.items():
            if value is not None:
                self._set_nested_value(config_data, key, value)
        
        return config_data
    
    def _get_bool_env(self, key: str, default: Optional[bool] = None) -> Optional[bool]:
        """Get boolean value from environment variable"""
        value = os.getenv(key)
        if value is None:
            return default
        return value.lower() in ("true", "1", "yes", "on")
    
    def _get_int_env(self, key: str, default: Optional[int] = None) -> Optional[int]:
        """Get integer value from environment variable"""
        value = os.getenv(key)
        if value is None:
            return default
        try:
            return int(value)
        except ValueError:
            return default
    
    def _set_nested_value(self, config_data: Dict[str, Any], key: str, value: Any) -> None:
        """Set nested dictionary value using dot notation"""
        keys = key.split('.')
        current = config_data
        
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        
        current[keys[-1]] = value
    
    @property
    def config(self) -> AppConfig:
        """Get loaded configuration"""
        if self._config is None:
            return self.load_config()
        return self._config


# Global configuration instance
config_manager = ConfigManager()


def get_config() -> AppConfig:
    """Get application configuration"""
    return config_manager.config