"""
Tagging service for automatic tag extraction and query intent analysis.
"""

import re
import time
from typing import Dict, List, Optional, Any
from collections import Counter
import logging

from src.abstractions import TaggingProvider, TagResult

logger = logging.getLogger(__name__)


class LocalTaggingService(TaggingProvider):
    """Local implementation of tagging service using rule-based and ML approaches"""
    
    def __init__(self, embedding_provider=None):
        """
        Initialize the tagging service.
        
        Args:
            embedding_provider: Optional embedding provider for semantic analysis
        """
        self.embedding_provider = embedding_provider
        self._init_knowledge_base()
    
    def _init_knowledge_base(self):
        """Initialize the knowledge base for tag extraction"""
        
        # Technical keywords organized by domain
        self.tech_keywords = {
            'java': [
                'java', 'jvm', 'jdk', 'openjdk', 'hotspot', 'graalvm',
                'spring', 'spring boot', 'maven', 'gradle', 'junit',
                'hibernate', 'jpa', 'jdbc', 'servlets', 'jsp'
            ],
            'performance': [
                'performance', 'optimization', 'tuning', 'benchmark',
                'profiling', 'speed', 'efficiency', 'latency', 'throughput',
                'gc', 'garbage collection', 'memory management', 'heap'
            ],
            'concurrency': [
                'concurrent', 'thread', 'threading', 'parallel', 'async',
                'synchronization', 'lock', 'mutex', 'semaphore', 'executor',
                'future', 'completable', 'fork join'
            ],
            'database': [
                'database', 'sql', 'mysql', 'postgresql', 'redis', 'mongodb',
                'transaction', 'acid', 'nosql', 'orm', 'query', 'index'
            ],
            'web': [
                'web', 'http', 'https', 'rest', 'api', 'microservice',
                'servlet', 'websocket', 'json', 'xml', 'oauth'
            ],
            'architecture': [
                'architecture', 'design', 'pattern', 'microservice',
                'distributed', 'scalability', 'reliability', 'availability'
            ],
            'security': [
                'security', 'authentication', 'authorization', 'encryption',
                'ssl', 'tls', 'oauth', 'jwt', 'cryptography'
            ],
            'testing': [
                'testing', 'unit test', 'integration test', 'junit', 'mockito',
                'test driven', 'tdd', 'bdd', 'mock', 'stub'
            ]
        }
        
        # Content type patterns
        self.content_patterns = {
            'tutorial': [
                'tutorial', 'how to', 'step by step', 'guide', 'walkthrough',
                'getting started', 'introduction', 'beginner'
            ],
            'reference': [
                'reference', 'api', 'documentation', 'specification',
                'manual', 'docs', 'javadoc'
            ],
            'troubleshooting': [
                'troubleshooting', 'problem', 'issue', 'error', 'bug',
                'fix', 'solution', 'debugging', 'exception'
            ],
            'best_practices': [
                'best practice', 'best practices', 'pattern', 'guideline',
                'recommendation', 'tip', 'advice', 'convention'
            ],
            'advanced': [
                'advanced', 'expert', 'deep dive', 'internal', 'internals',
                'low level', 'optimization', 'complex'
            ],
            'basics': [
                'basic', 'basics', 'introduction', 'overview', 'fundamental',
                'getting started', 'simple', 'beginner'
            ]
        }
        
        # File extension to content type mapping
        self.file_type_mapping = {
            '.md': 'markdown',
            '.txt': 'text',
            '.pdf': 'pdf',
            '.docx': 'document',
            '.html': 'html',
            '.java': 'code',
            '.py': 'code',
            '.js': 'code'
        }
    
    async def extract_tags_from_content(
        self,
        content: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> TagResult:
        """Extract tags from document content"""
        start_time = time.time()
        
        try:
            # Extract tags from different sources
            filename_tags = self._extract_from_filename(filename) if filename else []
            keyword_tags = self._extract_keywords(content)
            header_tags = self._extract_from_headers(content)
            tech_tags = self._extract_tech_stack(content)
            content_type_tags = self._classify_content_type(content)
            
            # Combine all tags
            all_tags = filename_tags + keyword_tags + header_tags + tech_tags + content_type_tags
            
            # Remove duplicates while preserving order
            unique_tags = list(dict.fromkeys(all_tags))
            
            # Calculate tag weights
            tag_weights = self._calculate_tag_weights(content, unique_tags)
            
            # Calculate confidence scores
            confidence_scores = self._calculate_confidence_scores(
                content, unique_tags, filename_tags, keyword_tags
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return TagResult(
                auto_tags=unique_tags,
                manual_tags=[],
                tag_weights=tag_weights,
                confidence_scores=confidence_scores,
                extraction_metadata={
                    'processing_time_ms': processing_time,
                    'extraction_methods': ['filename', 'keywords', 'headers', 'tech_stack', 'content_type'],
                    'source_filename': filename,
                    'content_length': len(content)
                }
            )
            
        except Exception as e:
            logger.error(f"Tag extraction failed: {e}")
            return TagResult(
                auto_tags=[],
                extraction_metadata={'error': str(e)}
            )
    
    async def analyze_query_intent(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None
    ) -> TagResult:
        """Analyze user query to extract intent tags"""
        start_time = time.time()
        
        try:
            query_lower = query.lower()
            
            # Extract technical domain tags
            domain_tags = []
            for domain, keywords in self.tech_keywords.items():
                if any(keyword in query_lower for keyword in keywords):
                    domain_tags.append(domain)
            
            # Determine query intent/type
            intent_tags = []
            
            # Question types
            if any(word in query_lower for word in ['how to', 'how do', 'how can']):
                intent_tags.append('how-to')
            elif any(word in query_lower for word in ['what is', 'what are', 'define']):
                intent_tags.append('definition')
            elif any(word in query_lower for word in ['compare', 'difference', 'vs', 'versus']):
                intent_tags.append('comparison')
            elif any(word in query_lower for word in ['troubleshoot', 'fix', 'error', 'problem']):
                intent_tags.append('troubleshooting')
            elif any(word in query_lower for word in ['example', 'sample', 'demo']):
                intent_tags.append('example')
            elif any(word in query_lower for word in ['best practice', 'recommend', 'should']):
                intent_tags.append('best-practices')
            
            # Combine all extracted tags
            all_tags = domain_tags + intent_tags
            
            # Calculate weights based on query context
            tag_weights = {}
            for tag in all_tags:
                # Higher weight for explicit matches
                if tag in domain_tags:
                    tag_weights[tag] = 0.8
                else:
                    tag_weights[tag] = 0.6
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return TagResult(
                auto_tags=all_tags,
                tag_weights=tag_weights,
                confidence_scores=tag_weights,
                extraction_metadata={
                    'processing_time_ms': processing_time,
                    'query': query,
                    'domain_tags': domain_tags,
                    'intent_tags': intent_tags
                }
            )
            
        except Exception as e:
            logger.error(f"Query intent analysis failed: {e}")
            return TagResult(
                auto_tags=[],
                extraction_metadata={'error': str(e)}
            )
    
    async def suggest_related_tags(
        self,
        existing_tags: List[str],
        domain: Optional[str] = None
    ) -> List[str]:
        """Suggest related tags based on existing tags"""
        
        related_tags = set()
        
        # For each existing tag, find related tags in the same domain
        for tag in existing_tags:
            for domain_name, keywords in self.tech_keywords.items():
                if tag in keywords:
                    # Add other keywords from the same domain
                    related_tags.update(keywords[:5])  # Limit to 5 related tags per domain
        
        # Remove existing tags from suggestions
        related_tags = related_tags - set(existing_tags)
        
        return list(related_tags)[:10]  # Return top 10 suggestions
    
    def _extract_from_filename(self, filename: str) -> List[str]:
        """Extract tags from filename"""
        if not filename:
            return []
        
        tags = []
        filename_lower = filename.lower()
        
        # Remove file extension
        name_without_ext = filename_lower.rsplit('.', 1)[0]
        
        # Split by common separators and extract meaningful parts
        parts = re.split(r'[_\-\s]+', name_without_ext)
        
        # Check each part against known patterns
        for part in parts:
            for domain, keywords in self.tech_keywords.items():
                if part in keywords or any(keyword in part for keyword in keywords):
                    tags.append(domain)
                    if part not in tags:
                        tags.append(part)
        
        return tags
    
    def _extract_keywords(self, content: str) -> List[str]:
        """Extract keywords from content using frequency analysis"""
        content_lower = content.lower()
        tags = []
        
        # Count occurrences of technical keywords
        keyword_counts = {}
        for domain, keywords in self.tech_keywords.items():
            total_count = 0
            for keyword in keywords:
                count = content_lower.count(keyword)
                total_count += count
            
            if total_count >= 2:  # Threshold for relevance
                keyword_counts[domain] = total_count
                tags.append(domain)
        
        return tags
    
    def _extract_from_headers(self, content: str) -> List[str]:
        """Extract tags from markdown headers"""
        tags = []
        
        # Extract markdown headers
        header_pattern = r'^#{1,6}\s+(.+)$'
        headers = re.findall(header_pattern, content, re.MULTILINE)
        
        if not headers:
            return tags
        
        # Combine all header text
        all_headers = ' '.join(headers).lower()
        
        # Check headers against content type patterns
        for content_type, patterns in self.content_patterns.items():
            if any(pattern in all_headers for pattern in patterns):
                tags.append(content_type)
        
        return tags
    
    def _extract_tech_stack(self, content: str) -> List[str]:
        """Extract technology stack from code blocks and imports"""
        tags = []
        
        # Extract code block languages
        code_pattern = r'```(\w+)'
        languages = re.findall(code_pattern, content, re.IGNORECASE)
        
        for lang in languages:
            lang_lower = lang.lower()
            if lang_lower in ['java', 'python', 'javascript', 'typescript']:
                tags.append(lang_lower)
        
        # Look for import statements and framework patterns
        if 'import java.' in content or 'org.springframework' in content:
            tags.append('java')
        if '@SpringBootApplication' in content or 'spring' in content.lower():
            tags.append('spring')
        
        return tags
    
    def _classify_content_type(self, content: str) -> List[str]:
        """Classify the type of content"""
        content_lower = content.lower()
        tags = []
        
        for content_type, patterns in self.content_patterns.items():
            if any(pattern in content_lower for pattern in patterns):
                tags.append(content_type)
        
        return tags
    
    def _calculate_tag_weights(self, content: str, tags: List[str]) -> Dict[str, float]:
        """Calculate weights for extracted tags"""
        content_lower = content.lower()
        tag_weights = {}
        
        for tag in tags:
            weight = 0.5  # Base weight
            
            # Check frequency in content
            if tag in self.tech_keywords:
                keywords = self.tech_keywords[tag]
                frequency = sum(content_lower.count(keyword) for keyword in keywords)
                weight += min(frequency * 0.1, 0.4)  # Max 0.4 bonus from frequency
            
            # Check if tag appears in title/headers
            header_pattern = r'^#{1,6}\s+(.+)$'
            headers = re.findall(header_pattern, content, re.MULTILINE)
            if any(tag in header.lower() for header in headers):
                weight += 0.3
            
            tag_weights[tag] = min(weight, 1.0)  # Cap at 1.0
        
        return tag_weights
    
    def _calculate_confidence_scores(
        self, 
        content: str, 
        tags: List[str],
        filename_tags: List[str],
        keyword_tags: List[str]
    ) -> Dict[str, float]:
        """Calculate confidence scores for tags"""
        confidence_scores = {}
        
        for tag in tags:
            confidence = 0.3  # Base confidence
            
            # Higher confidence for filename-based tags
            if tag in filename_tags:
                confidence += 0.4
            
            # Higher confidence for keyword-based tags
            if tag in keyword_tags:
                confidence += 0.3
            
            confidence_scores[tag] = min(confidence, 1.0)
        
        return confidence_scores