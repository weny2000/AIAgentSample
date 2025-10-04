"""
Document processing utilities for various file formats and URLs.
"""

import os
import re
import asyncio
import aiohttp
import aiofiles
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse, urljoin
import magic
import PyPDF2
from bs4 import BeautifulSoup
import io
from datetime import datetime
import uuid

from .models import Document, DocumentChunk, SourceType


class DocumentProcessor:
    """Handles document parsing and content extraction"""
    
    def __init__(self, max_file_size_mb: int = 100):
        self.max_file_size_bytes = max_file_size_mb * 1024 * 1024
    
    async def process_file(
        self,
        file_content: bytes,
        filename: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """
        Process uploaded file and extract content.
        
        Args:
            file_content: File content as bytes
            filename: Original filename
            metadata: Optional metadata
            
        Returns:
            Document object with extracted content
        """
        # Validate file size
        if len(file_content) > self.max_file_size_bytes:
            raise ValueError(f"File size exceeds maximum limit of {self.max_file_size_bytes / (1024*1024):.1f}MB")
        
        # Detect file type
        file_type = self._detect_file_type(file_content, filename)
        
        # Extract content based on file type
        if file_type == "application/pdf":
            content = await self._extract_pdf_content(file_content)
        elif file_type.startswith("text/"):
            content = await self._extract_text_content(file_content)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        # Create document
        document = Document(
            id=str(uuid.uuid4()),
            title=metadata.get("title", Path(filename).stem),
            content=content,
            source_type=SourceType.FILE,
            source_location=filename,
            original_filename=filename,
            author=metadata.get("author"),
            language=metadata.get("language"),
            tags=metadata.get("tags", []),
            metadata=metadata or {}
        )
        
        return document
    
    async def process_url(
        self,
        url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """
        Process URL and extract content.
        
        Args:
            url: URL to process
            metadata: Optional metadata
            
        Returns:
            Document object with extracted content
        """
        # Validate URL
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            raise ValueError(f"Invalid URL: {url}")
        
        # Fetch content
        content, page_title = await self._fetch_url_content(url)
        
        # Create document
        document = Document(
            id=str(uuid.uuid4()),
            title=metadata.get("title", page_title or parsed_url.netloc),
            content=content,
            source_type=SourceType.URL,
            source_location=url,
            author=metadata.get("author"),
            language=metadata.get("language"),
            tags=metadata.get("tags", []),
            metadata=metadata or {}
        )
        
        return document
    
    def _detect_file_type(self, file_content: bytes, filename: str) -> str:
        """Detect file MIME type"""
        try:
            return magic.from_buffer(file_content, mime=True)
        except Exception:
            # Fallback to extension-based detection
            ext = Path(filename).suffix.lower()
            mime_map = {
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.md': 'text/markdown',
                '.html': 'text/html',
                '.htm': 'text/html'
            }
            return mime_map.get(ext, 'application/octet-stream')
    
    async def _extract_pdf_content(self, file_content: bytes) -> str:
        """Extract text content from PDF"""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            
            # Check if PDF is encrypted
            if pdf_reader.is_encrypted:
                raise ValueError("PDF file is encrypted and cannot be processed")
            
            # Extract text from all pages
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text_parts.append(f"[Page {page_num + 1}]\n{page_text}")
                except Exception as e:
                    print(f"Warning: Could not extract text from page {page_num + 1}: {e}")
                    continue
            
            if not text_parts:
                raise ValueError("No readable text found in PDF")
            
            return "\n\n".join(text_parts)
            
        except Exception as e:
            raise ValueError(f"Failed to process PDF: {str(e)}")
    
    async def _extract_text_content(self, file_content: bytes) -> str:
        """Extract content from text files"""
        try:
            # Try different encodings
            for encoding in ['utf-8', 'utf-8-sig', 'latin1', 'cp1252']:
                try:
                    return file_content.decode(encoding)
                except UnicodeDecodeError:
                    continue
            
            raise ValueError("Could not decode text file with any supported encoding")
            
        except Exception as e:
            raise ValueError(f"Failed to process text file: {str(e)}")
    
    async def _fetch_url_content(self, url: str) -> Tuple[str, Optional[str]]:
        """Fetch and extract content from URL"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=30),
                    headers={'User-Agent': 'KnowledgeBase-RAG-Bot/1.0'}
                ) as response:
                    if response.status != 200:
                        raise ValueError(f"HTTP {response.status}: {response.reason}")
                    
                    content_type = response.headers.get('content-type', '').lower()
                    if not content_type.startswith('text/html'):
                        raise ValueError(f"Unsupported content type: {content_type}")
                    
                    html_content = await response.text()
                    
            # Parse HTML and extract content
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Extract title
            title_elem = soup.find('title')
            page_title = title_elem.get_text().strip() if title_elem else None
            
            # Extract main content
            content_parts = []
            
            # Try to find main content areas
            main_content = soup.find('main') or soup.find('article') or soup.find('div', class_=re.compile(r'content|main|body'))
            
            if main_content:
                content_parts.append(self._extract_html_text(main_content))
            else:
                # Fallback: extract from body
                body = soup.find('body')
                if body:
                    content_parts.append(self._extract_html_text(body))
                else:
                    # Last resort: get all text
                    content_parts.append(soup.get_text())
            
            # Clean and join content
            content = "\n\n".join(content_parts)
            content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)  # Remove excessive newlines
            content = content.strip()
            
            if not content:
                raise ValueError("No readable content found on webpage")
            
            return content, page_title
            
        except Exception as e:
            raise ValueError(f"Failed to fetch URL content: {str(e)}")
    
    def _extract_html_text(self, element) -> str:
        """Extract structured text from HTML element, preserving some formatting"""
        text_parts = []
        
        for elem in element.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th']):
            text = elem.get_text().strip()
            if text:
                # Add formatting hints for headers
                if elem.name.startswith('h'):
                    level = int(elem.name[1])
                    prefix = '#' * level + ' '
                    text_parts.append(f"{prefix}{text}")
                elif elem.name == 'li':
                    text_parts.append(f"• {text}")
                else:
                    text_parts.append(text)
        
        return "\n\n".join(text_parts)


class TextChunker:
    """Handles intelligent text chunking with semantic boundaries"""
    
    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        min_chunk_size: int = 100
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
    
    def chunk_document(self, document: Document) -> List[DocumentChunk]:
        """
        Split document into semantic chunks.
        
        Args:
            document: Document to chunk
            
        Returns:
            List of DocumentChunk objects
        """
        # First, try to split by semantic boundaries
        chunks = self._split_by_semantic_boundaries(document.content)
        
        # If chunks are too large, further split them
        final_chunks = []
        for chunk_text in chunks:
            if len(chunk_text) > self.chunk_size:
                sub_chunks = self._split_by_size(chunk_text)
                final_chunks.extend(sub_chunks)
            else:
                final_chunks.append(chunk_text)
        
        # Create DocumentChunk objects
        document_chunks = []
        for i, chunk_text in enumerate(final_chunks):
            if len(chunk_text.strip()) >= self.min_chunk_size:
                chunk = DocumentChunk(
                    id=f"{document.id}#chunk{i}",
                    content=chunk_text.strip(),
                    chunk_index=i,
                    chunk_size=len(chunk_text),
                    source_document_id=document.id,
                    metadata={
                        "source_type": document.source_type.value,
                        "source_location": document.source_location,
                        "title": document.title,
                        "author": document.author,
                        "tags": document.tags,
                        **document.metadata
                    }
                )
                document_chunks.append(chunk)
        
        return document_chunks
    
    def _split_by_semantic_boundaries(self, text: str) -> List[str]:
        """Split text by semantic boundaries like paragraphs and sections"""
        chunks = []
        
        # Split by double newlines (paragraphs)
        paragraphs = re.split(r'\n\s*\n', text)
        
        current_chunk = ""
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            
            # Check if adding this paragraph would exceed chunk size
            if len(current_chunk) + len(paragraph) + 2 > self.chunk_size and current_chunk:
                chunks.append(current_chunk)
                
                # Start new chunk with overlap
                if self.chunk_overlap > 0:
                    current_chunk = self._get_overlap_text(current_chunk) + "\n\n" + paragraph
                else:
                    current_chunk = paragraph
            else:
                if current_chunk:
                    current_chunk += "\n\n" + paragraph
                else:
                    current_chunk = paragraph
        
        # Add remaining content
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    
    def _split_by_size(self, text: str) -> List[str]:
        """Split text by fixed size with overlap"""
        chunks = []
        
        # Split by sentences first
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_chunk = ""
        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 > self.chunk_size and current_chunk:
                chunks.append(current_chunk)
                
                # Start new chunk with overlap
                if self.chunk_overlap > 0:
                    current_chunk = self._get_overlap_text(current_chunk) + " " + sentence
                else:
                    current_chunk = sentence
            else:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
        
        # Add remaining content
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    
    def _get_overlap_text(self, text: str) -> str:
        """Get overlap text from the end of current chunk"""
        if len(text) <= self.chunk_overlap:
            return text
        
        # Find the best break point within overlap range
        overlap_start = len(text) - self.chunk_overlap
        
        # Try to break at sentence boundary
        sentence_break = text.rfind('.', overlap_start)
        if sentence_break > overlap_start:
            return text[sentence_break + 1:].strip()
        
        # Try to break at word boundary
        word_break = text.rfind(' ', overlap_start)
        if word_break > overlap_start:
            return text[word_break + 1:].strip()
        
        # Fallback: cut at exact position
        return text[-self.chunk_overlap:]
    
    async def extract_text(
        self, 
        content: bytes, 
        content_type: str, 
        filename: Optional[str] = None
    ) -> str:
        """
        Extract text content from binary data based on content type
        
        Args:
            content: Binary file content
            content_type: MIME type of the content
            filename: Optional filename for additional context
            
        Returns:
            str: Extracted text content
        """
        try:
            if content_type == "application/pdf":
                return await self._extract_pdf_content(content)
            elif content_type.startswith("text/"):
                return await self._extract_text_content(content)
            elif content_type == "application/json":
                return content.decode('utf-8')
            else:
                # For unsupported types, return a placeholder
                return f"[Unsupported file type: {content_type}, filename: {filename or 'unknown'}]"
        except Exception as e:
            return f"[Failed to extract text from {filename or 'file'}: {str(e)}]"