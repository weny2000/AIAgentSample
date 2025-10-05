from __future__ import annotations

import os
from typing import List, Dict, Any, Optional

import yaml
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from .types import SearchResult


DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
TACIT_SOURCE_PATH = os.path.join(DATA_DIR, "tacit_knowledge.yaml")
EMBEDDINGS_CACHE_PATH = os.path.join(DATA_DIR, "tacit_embeddings_cache.npy")


class TacitFinder:
    """
    Tacit knowledge finder agent.

    Inputs:
    - info_results: Output list from InfoFinder.search (titles/summaries/keywords)
    - keywords: Keywords list from KeywordsFinder.extract_keywords

    Performs both keyword-based and semantic search over strands_agents/data/tacit_knowledge.yaml
    and returns the most relevant tacit knowledge entries.

    The implementation mirrors InfoFinder but targets tacit_knowledge.yaml and
    supports building a semantic query from InfoFinder results when available.
    """

    def __init__(self) -> None:
        # Sentence embedding model
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

        # Load tacit corpus
        with open(TACIT_SOURCE_PATH, "r", encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        self.data: List[Dict[str, Any]] = doc.get("sources", [])

        # Load or compute embeddings for tacit entries (title + summary)
        self.embeddings: np.ndarray = self._load_or_compute_embeddings()

    def _texts_to_embed(self) -> List[str]:
        return [f"{d.get('title', '')}: {d.get('summary', '')}" for d in self.data]

    def _load_or_compute_embeddings(self) -> np.ndarray:
        if os.path.exists(EMBEDDINGS_CACHE_PATH):
            try:
                emb = np.load(EMBEDDINGS_CACHE_PATH)
                # Recompute if corpus size changed or cache is invalid
                if emb.shape[0] != len(self.data):
                    emb = self._compute_embeddings()
                    np.save(EMBEDDINGS_CACHE_PATH, emb)
                return emb
            except Exception:
                # Fallback to recompute on any cache load error
                emb = self._compute_embeddings()
                np.save(EMBEDDINGS_CACHE_PATH, emb)
                return emb
        else:
            emb = self._compute_embeddings()
            np.save(EMBEDDINGS_CACHE_PATH, emb)
            return emb

    def _compute_embeddings(self) -> np.ndarray:
        texts = self._texts_to_embed()
        return self.model.encode(texts, show_progress_bar=False)

    async def search(self, prompt: str, keywords: List[str]) -> List[SearchResult]:
        """
        Search tacit knowledge using a free-form prompt and keywords.
        Mirrors InfoFinder.search behavior but targets tacit_knowledge.yaml.
        """
        kw = [k.lower() for k in (keywords or []) if isinstance(k, str)]
        keyword_results: List[Dict[str, Any]] = []
        if kw:
            for entry in self.data:
                text_to_search = " ".join([
                    entry.get("title", "") or "",
                    entry.get("summary", "") or "",
                    " ".join(entry.get("keywords", []) or []),
                ]).lower()
                if any(k in text_to_search for k in kw):
                    keyword_results.append(entry)

        semantic_results: List[Dict[str, Any]] = []
        if prompt and self.embeddings.shape[0] > 0:
            prompt_embedding = self.model.encode([prompt])
            similarities = cosine_similarity(prompt_embedding, self.embeddings)[0]
            # Top-N
            top_indices = np.argsort(similarities)[-10:][::-1]
            semantic_results = [self.data[i] for i in top_indices]

        # Combine and deduplicate (by 'id')
        combined: Dict[str, Dict[str, Any]] = {}
        for res in semantic_results + keyword_results:
            rid = res.get("id")
            if rid is not None and rid not in combined:
                combined[rid] = res

        mapped: List[SearchResult] = []
        for entry in list(combined.values())[:10]:
            mapped.append({
                "title": entry.get("title", ""),
                "snippet": entry.get("summary", ""),
                "authors": entry.get("authors", []),
                "department": entry.get("department", ""),
                "tags": entry.get("keywords", []),
            })
        return mapped

    async def search_with_info(self, info_results: List[SearchResult], keywords: List[str]) -> List[SearchResult]:
        """
        Search tacit knowledge using outputs from InfoFinder (titles/summaries/keywords)
        combined with extracted keywords from KeywordsFinder.

        - Builds a semantic query from the top InfoFinder results' titles and summaries.
        - Expands keyword search using both provided keywords and any keywords present
          in the info_results entries.
        """
        # Build combined prompt from info_results titles and summaries (limit to first 5 for focus)
        parts: List[str] = []
        for r in (info_results or [])[:5]:
            title = str(r.get("title", "") or "")
            # InfoFinder returns entries with 'summary'; PeopleFinder sometimes uses 'snippet'
            summary = str(r.get("summary", r.get("snippet", "")) or "")
            parts.append(f"{title}. {summary}")
        prompt_text: str = " ".join(parts).strip()

        # Expand keywords with those found in info_results entries
        expanded_keywords: List[str] = list(keywords or [])
        for r in info_results or []:
            for k in r.get("keywords", []) or []:
                if isinstance(k, str):
                    expanded_keywords.append(k)
        # Deduplicate while preserving order
        seen = set()
        expanded_keywords = [k for k in expanded_keywords if not (k in seen or seen.add(k))]

        # Perform search
        return await self.search(prompt=prompt_text, keywords=expanded_keywords)
