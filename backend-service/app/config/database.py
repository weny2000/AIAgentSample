# Database configuration settings

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings for SQLModel"""
    
    # Database connection components
    db_host: str = Field(default="localhost", alias="DB_HOST")
    db_port: int = Field(default=5432, alias="DB_PORT")
    db_name: str = Field(default="ai_knowledge_platform", alias="DB_NAME")
    db_user: str = Field(default="postgres", alias="DB_USER")
    db_password: str | None = Field(default=None, alias="DB_PASSWORD")
    
    # Additional settings
    db_pool_size: int = Field(default=5, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    
    # App settings
    debug: bool = Field(default=False, alias="DEBUG")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    
    @property
    def database_url_sync(self) -> str:
        """Sync database URL for SQLModel"""
        if not self.db_password or self.db_password == "":
            raise ValueError("Database password is required")
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    @property
    def database_url_async(self) -> str:
        """Async database URL for async operations"""
        if not self.db_password or self.db_password == "":
            raise ValueError("Database password must be provided via DB_PASSWORD environment variable")
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    # SQLModel settings
    echo_sql: bool = Field(default=False, alias="DB_ECHO_SQL")
    
    # Pydantic V2 configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"  # Allow extra fields in .env file
    )


# Global settings instance - configuration only, no engines
db_settings = DatabaseSettings()