from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple
import os
import yaml

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
GRAPH_PATH = os.path.join(DATA_DIR, "people_graph.yaml")


@dataclass
class GraphPerson:
    name: str
    department: str
    contacts: List[Tuple[str, str]]
    preferred_contact: Tuple[str, str]
    influences: Dict[str, float]
    expertise: List[str]


class PeopleGraph:
    def __init__(self, people: Dict[str, GraphPerson]):
        self.people = people

    @classmethod
    def from_file(cls, path: str = GRAPH_PATH) -> "PeopleGraph":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        
        people: Dict[str, GraphPerson] = {}
        for person_data in data.get("people", []):
            name = person_data.get("name", "Unknown")
            department = person_data.get("department", "")
            
            # Parse contacts
            contacts = []
            for contact in person_data.get("contacts", []):
                if isinstance(contact, dict):
                    for contact_type, contact_value in contact.items():
                        contacts.append((contact_type, contact_value))
            
            # Parse preferred contact
            preferred_raw = person_data.get("preferred_contact", "")
            pref = ("unknown", "")
            if preferred_raw and ":" in preferred_raw:
                t, v = preferred_raw.split(":", 1)
                pref = (t.strip(), v.strip())
            
            # Parse influences
            influences = {}
            for influence in person_data.get("influences", []):
                if isinstance(influence, dict):
                    influence_name = influence.get("name", "")
                    influence_weight = influence.get("weight", 0.0)
                    influences[influence_name] = float(influence_weight)
            
            # Parse expertise
            expertise = person_data.get("expertise", [])
            
            gp = GraphPerson(
                name=name,
                department=department,
                contacts=contacts,
                preferred_contact=pref,
                influences=influences,
                expertise=expertise,
            )
            people[gp.name] = gp
        return cls(people)

    def rank_candidates(self, results: List[dict], keywords: List[str]) -> List[GraphPerson]:
        kw = {k.lower() for k in keywords}
        scores: List[tuple[float, GraphPerson]] = []
        centrality = {p.name: sum(p.influences.values()) for p in self.people.values()}
        for p in self.people.values():
            exp_overlap = len({e.lower() for e in p.expertise} & kw)
            dept_bonus = 0.5 if any(p.department.lower() in (r.get("department", "").lower()) for r in results) else 0.0
            score = exp_overlap + centrality.get(p.name, 0.0) + dept_bonus
            scores.append((score, p))
        scores.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scores]


# Helper functions no longer needed with YAML parsing
