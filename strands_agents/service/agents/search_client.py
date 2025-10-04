from __future__ import annotations

from typing import List
import json
import os

from .types import SearchResult

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
SEARCH_PATH = os.path.join(DATA_DIR, "search_results.json")


class SearchClient:
    async def search(self, keywords: List[str]) -> List[SearchResult]:
        with open(SEARCH_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        kw = [k.lower() for k in keywords]
        def match(entry: dict) -> bool:
            text = " ".join([
                entry.get("title", ""),
                entry.get("snippet", ""),
                " ".join(entry.get("authors", [])),
                entry.get("department", ""),
                " ".join(entry.get("tags", [])),
            ]).lower()
            return any(k in text for k in kw) if kw else True
        filtered = [e for e in data if match(e)]
        return filtered[:10]
