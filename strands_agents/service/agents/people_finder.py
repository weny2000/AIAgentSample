from __future__ import annotations
from typing import List

from .types import IntermediateInfo, SearchResult, SelectedPerson
from .graph_loader import PeopleGraph



class PeopleFinder:
    def __init__(self) -> None:
        self.graph = PeopleGraph.from_file()

    async def select_person(self, results: List[SearchResult], keywords: List[str]) -> IntermediateInfo:
        ranked = self.graph.rank_candidates(results, keywords)
        chosen = ranked[0]
        selected: SelectedPerson = {
            "name": chosen.name,
            "department": chosen.department,
            "contact": {"type": chosen.preferred_contact[0], "value": chosen.preferred_contact[1]},
            "languages": chosen.languages,
        }
        summary = [{"title": r.get("title", ""), "snippet": r.get("snippet", "")} for r in results[:5]]
        return IntermediateInfo(selected_person=selected, search_summary=summary)
