from __future__ import annotations

import asyncio
from typing import List, Dict, Any
import os
import yaml
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from .types import SearchResult

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DATA_SOURCE_PATH = os.path.join(DATA_DIR, "data_source.yaml")
EMBEDDINGS_CACHE_PATH = os.path.join(DATA_DIR, "embeddings_cache.npy")


class InfoFinder:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        with open(DATA_SOURCE_PATH, "r", encoding="utf-8") as f:
            self.data = yaml.safe_load(f)["sources"]

        if os.path.exists(EMBEDDINGS_CACHE_PATH):
            self.embeddings = np.load(EMBEDDINGS_CACHE_PATH)
        else:
            self.embeddings = self._compute_embeddings()
            np.save(EMBEDDINGS_CACHE_PATH, self.embeddings)

    def _compute_embeddings(self) -> np.ndarray:
        texts_to_embed = [
            f"{d.get('title', '')}: {d.get('summary', '')}" for d in self.data
        ]
        return self.model.encode(texts_to_embed, show_progress_bar=True)

    async def search(self, prompt: str, keywords: List[str]) -> List[SearchResult]:
        # Keyword search
        kw = [k.lower() for k in keywords]
        keyword_results = []
        if kw:
            for entry in self.data:
                text_to_search = " ".join([
                    entry.get("title", ""),
                    entry.get("summary", ""),
                    " ".join(entry.get("keywords", [])),
                ]).lower()
                if any(k in text_to_search for k in kw):
                    keyword_results.append(entry)

        # Semantic search
        semantic_results = []
        if prompt and self.embeddings.shape[0] > 0:
            prompt_embedding = self.model.encode([prompt])
            similarities = cosine_similarity(prompt_embedding, self.embeddings)[0]
            
            # Get top 10 results
            top_indices = np.argsort(similarities)[-10:][::-1]
            semantic_results = [self.data[i] for i in top_indices]

        # Combine and deduplicate results
        combined_results: Dict[str, Any] = {}
        for res in semantic_results + keyword_results:
            if res['id'] not in combined_results:
                combined_results[res['id']] = res
        
        # Map raw entries to API SearchResult schema
        mapped: List[SearchResult] = []
        for entry in list(combined_results.values())[:10]:
            mapped.append({
                "title": entry.get("title", ""),
                "snippet": entry.get("summary", ""),
                "authors": entry.get("authors", []),
                "department": entry.get("department", ""),
                "tags": entry.get("keywords", []),
            })
        return mapped
