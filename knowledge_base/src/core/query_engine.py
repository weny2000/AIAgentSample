"""
Query engine for retrieving relevant knowledge chunks based on user queries.
"""

import time
import logging
from typing import List, Dict, Any, Optional

from src.abstractions import EmbeddingProvider, VectorDatabase, TaggingProvider
from .models import SearchResult, QueryRequest, QueryResponse

logger = logging.getLogger(__name__)


class QueryEngine:
    """
    Engine for querying the knowledge base using vector similarity search.
    """
    
    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_database: VectorDatabase,
        tagging_provider: Optional[TaggingProvider] = None,
        default_index_name: str = "knowledge_base"
    ):
        self.embedding_provider = embedding_provider
        self.vector_database = vector_database
        self.tagging_provider = tagging_provider
        self.default_index_name = default_index_name
    
    async def query(
        self,
        query_request: QueryRequest,
        index_name: Optional[str] = None
    ) -> QueryResponse:
        """
        Execute query against the knowledge base.
        
        Args:
            query_request: Query request with search parameters
            index_name: Optional index name (uses default if not provided)
            
        Returns:
            QueryResponse with search results
        """
        start_time = time.time()
        
        try:
            # Use provided index name or default
            target_index = index_name or self.default_index_name
            
            logger.info(f"Processing query: '{query_request.query}' (top_k={query_request.top_k})")
            
            # Automatically analyze query intent and extract tags (if tagging service is enabled)
            query_tags = []
            search_strategy = "semantic_search"
            
            if self.tagging_provider and query_request.use_tag_aware_search:
                try:
                    intent_result = await self.tagging_provider.analyze_query_intent(
                        query_request.query
                    )
                    query_tags = intent_result.auto_tags
                    search_strategy = "tag_aware_search"
                    logger.info(f"Query tag analysis: {query_tags}")
                except Exception as e:
                    logger.warning(f"Tag analysis failed, falling back to semantic search: {e}")
            
            # Generate query embedding
            query_vector = await self.embedding_provider.get_embedding(query_request.query)
            
            # Choose search strategy based on tag information
            if query_tags and hasattr(self.vector_database, 'search_with_tags'):
                # Use tag-aware search
                search_results = await self.vector_database.search_with_tags(
                    index_name=target_index,
                    query_vector=query_vector,
                    required_tags=query_request.required_tags,
                    optional_tags=query_tags + (query_request.optional_tags or []),
                    tag_weights=query_request.tag_weights,
                    top_k=query_request.top_k,
                    filter_criteria=query_request.filters
                )
            else:
                # Traditional semantic search
                search_results = await self.vector_database.search(
                    index_name=target_index,
                    query_vector=query_vector,
                    top_k=query_request.top_k,
                    filter_criteria=query_request.filters
                )
            
            # Transform to SearchResult objects
            results = []
            for result in search_results:
                search_result = SearchResult(
                    content=result['content'],
                    score=result['score'],
                    source=self._extract_source_info(result['metadata']),
                    metadata=result['metadata'] if query_request.include_metadata else {}
                )
                results.append(search_result)
            
            # Calculate processing time
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(f"Query completed in {processing_time_ms}ms, found {len(results)} results")
            
            return QueryResponse(
                query=query_request.query,
                results=results,
                total_results=len(results),
                processing_time_ms=processing_time_ms,
                query_tags=query_tags,  # Add query tag information
                search_strategy=search_strategy  # Add search strategy information
            )
            
        except Exception as e:
            logger.error(f"Query failed: {e}")
            raise
    
    async def similarity_search(
        self,
        query_text: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        index_name: Optional[str] = None
    ) -> List[SearchResult]:
        """
        Simplified similarity search interface.
        
        Args:
            query_text: Query text
            top_k: Number of results to return
            filters: Optional metadata filters
            index_name: Optional index name
            
        Returns:
            List of SearchResult objects
        """
        query_request = QueryRequest(
            query=query_text,
            top_k=top_k,
            filters=filters,
            include_metadata=True
        )
        
        response = await self.query(query_request, index_name)
        return response.results
    
    async def get_related_documents(
        self,
        document_id: str,
        top_k: int = 5,
        index_name: Optional[str] = None
    ) -> List[SearchResult]:
        """
        Find documents related to a specific document.
        
        Args:
            document_id: Source document ID
            top_k: Number of results to return
            index_name: Optional index name
            
        Returns:
            List of SearchResult objects
        """
        # First, get a chunk from the document to use as query
        target_index = index_name or self.default_index_name
        
        # Search for chunks from this document
        document_chunks = await self.vector_database.search(
            index_name=target_index,
            query_vector=[0.0] * self.embedding_provider.get_embedding_dimension(),  # Dummy vector
            top_k=1,
            filter_criteria={"source_document_id": document_id}
        )
        
        if not document_chunks:
            return []
        
        # Use the first chunk to find similar content
        query_vector = document_chunks[0].get('vector', [])
        if not query_vector:
            return []
        
        # Search for similar content, excluding the source document
        similar_results = await self.vector_database.search(
            index_name=target_index,
            query_vector=query_vector,
            top_k=top_k * 2,  # Get more to filter out same document
            filter_criteria=None
        )
        
        # Filter out chunks from the same document
        filtered_results = []
        for result in similar_results:
            if result['metadata'].get('source_document_id') != document_id:
                search_result = SearchResult(
                    content=result['content'],
                    score=result['score'],
                    source=self._extract_source_info(result['metadata']),
                    metadata=result['metadata']
                )
                filtered_results.append(search_result)
                
                if len(filtered_results) >= top_k:
                    break
        
        return filtered_results
    
    async def search_by_metadata(
        self,
        filters: Dict[str, Any],
        top_k: int = 100,
        index_name: Optional[str] = None
    ) -> List[SearchResult]:
        """
        Search documents by metadata filters only.
        
        Args:
            filters: Metadata filters
            top_k: Number of results to return
            index_name: Optional index name
            
        Returns:
            List of SearchResult objects
        """
        target_index = index_name or self.default_index_name
        
        # Use a zero vector for metadata-only search
        zero_vector = [0.0] * self.embedding_provider.get_embedding_dimension()
        
        search_results = await self.vector_database.search(
            index_name=target_index,
            query_vector=zero_vector,
            top_k=top_k,
            filter_criteria=filters
        )
        
        results = []
        for result in search_results:
            search_result = SearchResult(
                content=result['content'],
                score=0.0,  # No semantic score for metadata-only search
                source=self._extract_source_info(result['metadata']),
                metadata=result['metadata']
            )
            results.append(search_result)
        
        return results
    
    def _extract_source_info(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract source information from metadata.
        
        Args:
            metadata: Document metadata
            
        Returns:
            Source information dictionary
        """
        source_info = {
            "type": metadata.get("source_type", "unknown"),
            "location": metadata.get("source_location", ""),
        }
        
        # Add specific fields based on source type
        if "title" in metadata:
            source_info["title"] = metadata["title"]
        
        if "author" in metadata:
            source_info["author"] = metadata["author"]
        
        if "page_number" in metadata:
            source_info["page"] = metadata["page_number"]
        
        if "section_title" in metadata:
            source_info["section"] = metadata["section_title"]
        
        if "chunk_index" in metadata:
            source_info["chunk"] = metadata["chunk_index"]
        
        return source_info
    
    async def get_index_stats(self, index_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about the knowledge base index.
        
        Args:
            index_name: Optional index name
            
        Returns:
            Dictionary with index statistics
        """
        target_index = index_name or self.default_index_name
        
        try:
            # This would need to be implemented by each vector database adapter
            # For now, return basic info
            stats = {
                "index_name": target_index,
                "status": "active",
                "vector_dimension": self.embedding_provider.get_embedding_dimension()
            }
            
            # Try to get document count by searching with a dummy vector
            dummy_results = await self.vector_database.search(
                index_name=target_index,
                query_vector=[0.0] * self.embedding_provider.get_embedding_dimension(),
                top_k=1
            )
            
            # Note: This is an approximation - actual implementations should provide proper stats
            stats["estimated_documents"] = "unknown"
            stats["last_query_successful"] = len(dummy_results) >= 0
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get index stats: {e}")
            return {
                "index_name": target_index,
                "status": "error",
                "error": str(e)
            }