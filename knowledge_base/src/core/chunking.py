"""
Text Chunking Module - responsible for splitting text into appropriately sized chunks
"""

import logging
import re
from typing import List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ChunkConfig:
    """Text chunking configuration"""
    chunk_size: int = 1000
    chunk_overlap: int = 200
    min_chunk_size: int = 50
    separators: List[str] = None
    
    def __post_init__(self):
        if self.separators is None:
            self.separators = [
                "\n\n",  # Paragraph separator
                "\n",    # Line separator
                "。",    # Chinese period
                "！",    # Chinese exclamation
                "？",    # Chinese question mark
                ". ",    # English period + space
                "! ",    # English exclamation + space
                "? ",    # English question mark + space
                ";",     # Semicolon
                ",",     # Comma
                " ",     # Space
                ""       # Character split (last resort)
            ]


class TextChunker:
    """Text chunker"""
    
    def __init__(
        self, 
        chunk_size: int = 1000, 
        chunk_overlap: int = 200,
        min_chunk_size: int = 50
    ):
        self.config = ChunkConfig(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            min_chunk_size=min_chunk_size
        )
    
    async def chunk_text(self, text: str) -> List[str]:
        """
        Split text into chunks
        
        Args:
            text: Text to split
            
        Returns:
            List[str]: List of text chunks
        """
        if not text or not text.strip():
            return []
        
        # Clean text
        text = self._clean_text(text)
        
        # If text length is smaller than chunk_size, return directly
        if len(text) <= self.config.chunk_size:
            return [text]
        
        # Recursively split text
        chunks = self._split_text_recursive(text, self.config.separators)
        
        # Merge small chunks
        chunks = self._merge_small_chunks(chunks)
        
        # Handle overlap
        chunks = self._add_overlap(chunks)
        
        logger.info(f"Text chunked into {len(chunks)} pieces")
        return chunks
    
    def _clean_text(self, text: str) -> str:
        """Clean text"""
        # Remove excessive whitespace characters
        text = re.sub(r'\s+', ' ', text)
        # Remove leading and trailing whitespace
        text = text.strip()
        return text
    
    def _split_text_recursive(self, text: str, separators: List[str]) -> List[str]:
        """Recursively split text"""
        if not separators:
            # If no separators left, force split by characters
            return self._split_by_length(text)
        
        separator = separators[0]
        remaining_separators = separators[1:]
        
        if separator == "":
            # Empty string means split by characters
            return self._split_by_length(text)
        
        # Split by current separator
        splits = text.split(separator)
        
        chunks = []
        current_chunk = ""
        
        for i, split in enumerate(splits):
            # Re-add separator (except for the last one)
            if i < len(splits) - 1:
                split_with_sep = split + separator
            else:
                split_with_sep = split
            
            # If current chunk plus new split doesn't exceed size limit
            if len(current_chunk) + len(split_with_sep) <= self.config.chunk_size:
                current_chunk += split_with_sep
            else:
                # Current chunk is full, save and start new chunk
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                
                # If single split exceeds size limit, need further splitting
                if len(split_with_sep) > self.config.chunk_size:
                    sub_chunks = self._split_text_recursive(split_with_sep, remaining_separators)
                    chunks.extend(sub_chunks)
                    current_chunk = ""
                else:
                    current_chunk = split_with_sep
        
        # Add the last chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _split_by_length(self, text: str) -> List[str]:
        """Force split text by length"""
        chunks = []
        for i in range(0, len(text), self.config.chunk_size):
            chunk = text[i:i + self.config.chunk_size]
            if chunk.strip():
                chunks.append(chunk)
        return chunks
    
    def _merge_small_chunks(self, chunks: List[str]) -> List[str]:
        """Merge small text chunks"""
        if not chunks:
            return chunks
        
        merged_chunks = []
        current_chunk = ""
        
        for chunk in chunks:
            # If chunk is too small, try to merge with previous chunk
            if len(chunk) < self.config.min_chunk_size:
                if current_chunk:
                    # Check if merging would exceed size limit
                    merged = current_chunk + " " + chunk
                    if len(merged) <= self.config.chunk_size:
                        current_chunk = merged
                    else:
                        # Cannot merge, save current chunk and start new chunk
                        merged_chunks.append(current_chunk)
                        current_chunk = chunk
                else:
                    current_chunk = chunk
            else:
                # Chunk size is appropriate
                if current_chunk:
                    merged_chunks.append(current_chunk)
                current_chunk = chunk
        
        # Add the last chunk
        if current_chunk:
            merged_chunks.append(current_chunk)
        
        return merged_chunks
    
    def _add_overlap(self, chunks: List[str]) -> List[str]:
        """Add overlap to text chunks"""
        if len(chunks) <= 1 or self.config.chunk_overlap <= 0:
            return chunks
        
        overlapped_chunks = []
        
        for i, chunk in enumerate(chunks):
            if i == 0:
                # First chunk doesn't need preceding overlap
                overlapped_chunks.append(chunk)
            else:
                # Get overlap content from the end of previous chunk
                prev_chunk = chunks[i - 1]
                overlap_text = prev_chunk[-self.config.chunk_overlap:] if len(prev_chunk) > self.config.chunk_overlap else prev_chunk
                
                # Find appropriate overlap boundary (preferably at sentence or word boundary)
                overlap_text = self._find_overlap_boundary(overlap_text)
                
                # Build chunk with overlap
                overlapped_chunk = overlap_text + " " + chunk
                overlapped_chunks.append(overlapped_chunk)
        
        return overlapped_chunks
    
    def _find_overlap_boundary(self, overlap_text: str) -> str:
        """Find appropriate overlap boundary"""
        if not overlap_text:
            return ""
        
        # Try to cut at sentence boundaries
        for sep in ["。", "！", "？", ". ", "! ", "? "]:
            idx = overlap_text.rfind(sep)
            if idx > 0:
                return overlap_text[:idx + len(sep)]
        
        # If no sentence boundary found, try word boundaries
        for sep in [",", "，", " "]:
            idx = overlap_text.rfind(sep)
            if idx > 0:
                return overlap_text[:idx + len(sep)]
        
        # If none found, return original text
        return overlap_text
    
    def get_chunk_stats(self, chunks: List[str]) -> dict:
        """Get chunking statistics"""
        if not chunks:
            return {
                "total_chunks": 0,
                "total_characters": 0,
                "avg_chunk_size": 0,
                "min_chunk_size": 0,
                "max_chunk_size": 0
            }
        
        chunk_sizes = [len(chunk) for chunk in chunks]
        
        return {
            "total_chunks": len(chunks),
            "total_characters": sum(chunk_sizes),
            "avg_chunk_size": sum(chunk_sizes) / len(chunks),
            "min_chunk_size": min(chunk_sizes),
            "max_chunk_size": max(chunk_sizes)
        }