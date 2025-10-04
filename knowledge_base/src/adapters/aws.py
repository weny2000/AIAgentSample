"""
AWS service adapters for production environments.
"""

import json
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import hashlib
import base64

import boto3
from botocore.exceptions import ClientError
import aiohttp

from src.abstractions import (
    EmbeddingProvider, VectorDatabase, StorageProvider, 
    TaskQueue, StateManager, WorkflowOrchestrator
)
from src.core.models import Document, DocumentChunk, KnowledgeChunk, IngestionTask

logger = logging.getLogger(__name__)


class BedrockEmbeddingProvider(EmbeddingProvider):
    """AWS Bedrock embedding provider."""
    
    def __init__(self, region_name: str = "us-east-1", model_id: str = "amazon.titan-embed-text-v1"):
        self.region_name = region_name
        self.model_id = model_id
        self.client = None
        
    async def initialize(self):
        """Initialize Bedrock client."""
        if self.client is None:
            # Initialize in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            self.client = await loop.run_in_executor(
                None,
                lambda: boto3.client('bedrock-runtime', region_name=self.region_name)
            )
    
    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Bedrock."""
        if self.client is None:
            await self.initialize()
            
        embeddings = []
        
        # Process texts in batches to avoid rate limits
        batch_size = 25  # Bedrock typical batch limit
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            batch_embeddings = await self._process_batch(batch_texts)
            embeddings.extend(batch_embeddings)
            
        return embeddings
    
    async def _process_batch(self, texts: List[str]) -> List[List[float]]:
        """Process a batch of texts."""
        batch_embeddings = []
        
        for text in texts:
            try:
                body = json.dumps({
                    "inputText": text
                })
                
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.client.invoke_model(
                        body=body,
                        modelId=self.model_id,
                        accept='application/json',
                        contentType='application/json'
                    )
                )
                
                response_body = json.loads(response.get('body').read())
                embedding = response_body.get('embedding', [])
                batch_embeddings.append(embedding)
                
            except Exception as e:
                logger.error(f"Error generating embedding: {e}")
                # Return zero vector as fallback
                batch_embeddings.append([0.0] * 1536)  # Titan embedding dimension
                
        return batch_embeddings
    
    async def get_embedding_dimension(self) -> int:
        """Get the embedding dimension for Titan model."""
        return 1536  # Amazon Titan Text Embeddings dimension


class OpenSearchVectorDatabase(VectorDatabase):
    """AWS OpenSearch vector database."""
    
    def __init__(self, endpoint: str, region_name: str = "us-east-1", index_name: str = "knowledge-base"):
        self.endpoint = endpoint
        self.region_name = region_name
        self.index_name = index_name
        self.client = None
        
    async def initialize(self, collection_name: str = "knowledge_base"):
        """Initialize OpenSearch client."""
        if self.client is None:
            # Use opensearch-py with AWS auth
            from opensearchpy import OpenSearch, RequestsHttpConnection
            from opensearchpy.connection.http_requests import AWSV4SignerAuth
            
            # Get AWS credentials
            session = boto3.Session()
            credentials = session.get_credentials()
            
            auth = AWSV4SignerAuth(credentials, self.region_name, 'es')
            
            self.client = OpenSearch(
                hosts=[{'host': self.endpoint.replace('https://', ''), 'port': 443}],
                http_auth=auth,
                use_ssl=True,
                verify_certs=True,
                connection_class=RequestsHttpConnection,
            )
            
            # Create index if it doesn't exist
            await self._create_index_if_not_exists()
    
    async def _create_index_if_not_exists(self):
        """Create index with vector mapping."""
        index_body = {
            "settings": {
                "index": {
                    "knn": True,
                    "knn.algo_param.ef_search": 100
                }
            },
            "mappings": {
                "properties": {
                    "vector": {
                        "type": "knn_vector",
                        "dimension": 1536,  # Titan embedding dimension
                        "method": {
                            "name": "hnsw",
                            "space_type": "cosinesimil",
                            "engine": "nmslib"
                        }
                    },
                    "content": {
                        "type": "text"
                    },
                    "metadata": {
                        "type": "object"
                    }
                }
            }
        }
        
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.indices.create(
                    index=self.index_name,
                    body=index_body,
                    ignore=400
                )
            )
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
    
    async def add_vectors(
        self, 
        vectors: List[List[float]], 
        metadatas: List[Dict[str, Any]], 
        ids: List[str]
    ):
        """Add vectors to OpenSearch."""
        # Prepare bulk insert
        actions = []
        for i, (vector, metadata, doc_id) in enumerate(zip(vectors, metadatas, ids)):
            action = {
                "_index": self.index_name,
                "_id": doc_id,
                "_source": {
                    "vector": vector,
                    "metadata": metadata,
                    "content": metadata.get("content", "")
                }
            }
            actions.append(action)
        
        # Bulk insert
        try:
            from opensearchpy.helpers import bulk
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: bulk(self.client, actions)
            )
        except Exception as e:
            logger.error(f"Error adding vectors: {e}")
            raise
    
    async def search_vectors(
        self, 
        query_vector: List[float], 
        limit: int = 10,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """Search for similar vectors."""
        # Build search query
        knn_query = {
            "knn": {
                "vector": {
                    "vector": query_vector,
                    "k": limit
                }
            }
        }
        
        # Add filters if provided
        if filter_dict:
            bool_query = {
                "bool": {
                    "must": [knn_query],
                    "filter": []
                }
            }
            
            for key, value in filter_dict.items():
                bool_query["bool"]["filter"].append({
                    "term": {f"metadata.{key}": value}
                })
                
            search_body = {"query": bool_query}
        else:
            search_body = {"query": knn_query}
        
        search_body["size"] = limit
        
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.search(
                    index=self.index_name,
                    body=search_body
                )
            )
            
            results = []
            for hit in response['hits']['hits']:
                doc_id = hit['_id']
                score = hit['_score']
                metadata = hit['_source'].get('metadata', {})
                results.append((doc_id, score, metadata))
                
            return results
            
        except Exception as e:
            logger.error(f"Error searching vectors: {e}")
            return []
    
    async def delete_vectors(self, ids: List[str]):
        """Delete vectors by IDs."""
        try:
            actions = [
                {
                    "_op_type": "delete",
                    "_index": self.index_name,
                    "_id": doc_id
                }
                for doc_id in ids
            ]
            
            from opensearchpy.helpers import bulk
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: bulk(self.client, actions, ignore=404)
            )
        except Exception as e:
            logger.error(f"Error deleting vectors: {e}")
    
    async def update_vectors(
        self, 
        ids: List[str], 
        vectors: List[List[float]], 
        metadatas: List[Dict[str, Any]]
    ):
        """Update existing vectors."""
        await self.add_vectors(vectors, metadatas, ids)  # Upsert behavior


class S3StorageProvider(StorageProvider):
    """AWS S3 storage provider."""
    
    def __init__(self, bucket_name: str, region_name: str = "us-east-1", prefix: str = ""):
        self.bucket_name = bucket_name
        self.region_name = region_name
        self.prefix = prefix
        self.client = None
        
    async def initialize(self):
        """Initialize S3 client."""
        if self.client is None:
            self.client = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: boto3.client('s3', region_name=self.region_name)
            )
    
    async def store_file(self, file_path: str, content: bytes) -> str:
        """Store file in S3."""
        if self.client is None:
            await self.initialize()
            
        key = f"{self.prefix}/{file_path}".strip('/')
        
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=content
                )
            )
            return f"s3://{self.bucket_name}/{key}"
        except ClientError as e:
            logger.error(f"Error storing file: {e}")
            raise
    
    async def retrieve_file(self, file_path: str) -> bytes:
        """Retrieve file from S3."""
        if self.client is None:
            await self.initialize()
            
        key = f"{self.prefix}/{file_path}".strip('/')
        
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.get_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
            )
            return response['Body'].read()
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise FileNotFoundError(f"File not found: {file_path}")
            logger.error(f"Error retrieving file: {e}")
            raise
    
    async def delete_file(self, file_path: str):
        """Delete file from S3."""
        if self.client is None:
            await self.initialize()
            
        key = f"{self.prefix}/{file_path}".strip('/')
        
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.delete_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
            )
        except ClientError as e:
            logger.error(f"Error deleting file: {e}")
    
    async def list_files(self, prefix: str = "") -> List[str]:
        """List files with optional prefix."""
        if self.client is None:
            await self.initialize()
            
        full_prefix = f"{self.prefix}/{prefix}".strip('/')
        
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.list_objects_v2(
                    Bucket=self.bucket_name,
                    Prefix=full_prefix
                )
            )
            
            files = []
            for obj in response.get('Contents', []):
                # Remove the prefix to get relative path
                relative_path = obj['Key']
                if self.prefix:
                    relative_path = relative_path[len(self.prefix):].lstrip('/')
                files.append(relative_path)
                
            return files
        except ClientError as e:
            logger.error(f"Error listing files: {e}")
            return []


class SQSTaskQueue(TaskQueue):
    """AWS SQS task queue."""
    
    def __init__(self, queue_url: str, region_name: str = "us-east-1"):
        self.queue_url = queue_url
        self.region_name = region_name
        self.client = None
        
    async def initialize(self):
        """Initialize SQS client."""
        if self.client is None:
            self.client = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: boto3.client('sqs', region_name=self.region_name)
            )
    
    async def enqueue_task(self, queue_name: str, task_data: Dict[str, Any]) -> str:
        """Enqueue a task."""
        if self.client is None:
            await self.initialize()
            
        task_id = hashlib.md5(
            f"{queue_name}_{datetime.now().isoformat()}_{json.dumps(task_data)}".encode()
        ).hexdigest()
        
        message_body = {
            "id": task_id,
            "data": task_data,
            "created_at": datetime.now().isoformat(),
            "status": "pending"
        }
        
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.send_message(
                    QueueUrl=self.queue_url,
                    MessageBody=json.dumps(message_body),
                    MessageAttributes={
                        'TaskId': {
                            'StringValue': task_id,
                            'DataType': 'String'
                        },
                        'QueueName': {
                            'StringValue': queue_name,
                            'DataType': 'String'
                        }
                    }
                )
            )
            return task_id
        except ClientError as e:
            logger.error(f"Error enqueuing task: {e}")
            raise
    
    async def dequeue_task(self, queue_name: str, timeout: int = 30) -> Optional[Dict[str, Any]]:
        """Dequeue a task."""
        if self.client is None:
            await self.initialize()
            
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.receive_message(
                    QueueUrl=self.queue_url,
                    MaxNumberOfMessages=1,
                    WaitTimeSeconds=min(timeout, 20),  # SQS max wait time
                    MessageAttributeNames=['All']
                )
            )
            
            messages = response.get('Messages', [])
            if messages:
                message = messages[0]
                task_data = json.loads(message['Body'])
                
                # Delete message from queue
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.client.delete_message(
                        QueueUrl=self.queue_url,
                        ReceiptHandle=message['ReceiptHandle']
                    )
                )
                
                return task_data
                
        except ClientError as e:
            logger.error(f"Error dequeuing task: {e}")
            
        return None
    
    async def get_task_status(self, task_id: str) -> Optional[str]:
        """Get task status (requires external state management)."""
        # SQS doesn't provide task status directly
        # This would need to be implemented with DynamoDB or another state store
        logger.warning("Task status lookup not implemented for SQS")
        return None
    
    async def update_task_status(self, task_id: str, status: str, result: Optional[Dict[str, Any]] = None):
        """Update task status (requires external state management)."""
        # SQS doesn't provide task status updates directly
        # This would need to be implemented with DynamoDB or another state store
        logger.warning("Task status update not implemented for SQS")


class DynamoDBStateManager(StateManager):
    """AWS DynamoDB state manager."""
    
    def __init__(self, table_name: str, region_name: str = "us-east-1"):
        self.table_name = table_name
        self.region_name = region_name
        self.client = None
        self.table = None
        
    async def initialize(self):
        """Initialize DynamoDB client."""
        if self.client is None:
            self.client = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: boto3.client('dynamodb', region_name=self.region_name)
            )
            
            # Initialize resource for table operations
            dynamodb = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: boto3.resource('dynamodb', region_name=self.region_name)
            )
            self.table = dynamodb.Table(self.table_name)
    
    async def get_state(self, key: str) -> Optional[Any]:
        """Get state value."""
        if self.client is None:
            await self.initialize()
            
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.table.get_item(Key={'key': key})
            )
            
            item = response.get('Item')
            if item:
                return json.loads(item['value'])
            return None
            
        except ClientError as e:
            logger.error(f"Error getting state: {e}")
            return None
    
    async def set_state(self, key: str, value: Any):
        """Set state value."""
        if self.client is None:
            await self.initialize()
            
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.table.put_item(
                    Item={
                        'key': key,
                        'value': json.dumps(value),
                        'updated_at': datetime.now().isoformat()
                    }
                )
            )
        except ClientError as e:
            logger.error(f"Error setting state: {e}")
            raise
    
    async def delete_state(self, key: str):
        """Delete state value."""
        if self.client is None:
            await self.initialize()
            
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.table.delete_item(Key={'key': key})
            )
        except ClientError as e:
            logger.error(f"Error deleting state: {e}")
    
    async def list_keys(self, prefix: str = "") -> List[str]:
        """List all keys with optional prefix."""
        if self.client is None:
            await self.initialize()
            
        try:
            # Use scan with filter for prefix matching
            if prefix:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.table.scan(
                        FilterExpression="begins_with(#k, :prefix)",
                        ExpressionAttributeNames={'#k': 'key'},
                        ExpressionAttributeValues={':prefix': prefix}
                    )
                )
            else:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.table.scan()
                )
            
            return [item['key'] for item in response.get('Items', [])]
            
        except ClientError as e:
            logger.error(f"Error listing keys: {e}")
            return []