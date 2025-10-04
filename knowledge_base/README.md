# RAG Knowledge Base

A production-ready RAG (Retrieval-Augmented Generation) system with Docker deployment.

## Quick Start

```bash
# Build Docker images
sudo docker compose build --no-cache

# Start all services
sudo docker compose up -d

# Check service status
sudo docker compose ps

# View logs
sudo docker compose logs -f knowledge-base

# Stop services
sudo docker compose down
```

## Access

- **API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs  
- **Health Check**: http://localhost:8000/health

## Basic Usage

### Health Check
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "embedding_provider": "initialized",
    "vector_database": "initialized", 
    "storage_provider": "initialized",
    "task_queue": "initialized",
    "state_manager": "initialized",
    "workflow_orchestrator": "initialized",
    "tagging_provider": "initialized"
  }
}
```

### Upload Document
```bash
curl -X POST "http://localhost:8000/api/v1/upload" \
     -F "file=@document.pdf"
```

### Query Knowledge Base
```bash
curl -X POST "http://localhost:8000/api/v1/query" \
     -H "Content-Type: application/json" \
     -d '{"query": "What is AI?", "limit": 5}'
```

## Configuration

The system uses `config/local.yaml` by default. Edit this file to customize:

- Embedding models
- Vector database settings  
- Storage paths
- Database connections

## Architecture

- **PostgreSQL**: Task and document state management (internal network)
- **Redis**: Task queue and caching (internal network)
- **ChromaDB**: Vector embeddings storage
- **FastAPI**: REST API interface (port 8000)

All services run in isolated Docker containers with internal networking. Only the API service is exposed to the host.