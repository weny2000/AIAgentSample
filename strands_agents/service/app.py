from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import os

try:
    # Try relative imports first (when run as module)
    from .config import load_config
    from .agents.keywords_finder import KeywordsFinder
    from .agents.people_finder import PeopleFinder
    from .agents.response_builder import ResponseBuilder
    from .agents.info_finder import InfoFinder
    from .agents.tacit_finder import TacitFinder
    from .agents.types import SearchResult, IntermediateInfo
except ImportError:
    # Fall back to fully-qualified package imports (when run directly)
    from strands_agents.service.config import load_config
    from strands_agents.service.agents.keywords_finder import KeywordsFinder
    from strands_agents.service.agents.people_finder import PeopleFinder
    from strands_agents.service.agents.response_builder import ResponseBuilder
    from strands_agents.service.agents.info_finder import InfoFinder
    from strands_agents.service.agents.tacit_finder import TacitFinder
    from strands_agents.service.agents.types import SearchResult, IntermediateInfo

# Load configuration from .env file
load_config()

# Configure logging (write to /Users/qingjie.du/HDD/aws-hackathon/AIAgentSample/strands_agents/service/logs and also to console)
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
numeric_level = getattr(logging, log_level, logging.INFO)

logging.basicConfig(
    level=numeric_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[
        RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=3),
        logging.StreamHandler(),
    ],
)

app = FastAPI()

# Initialize agents at startup to load models and data only once
keywords_finder = KeywordsFinder()
info_finder = InfoFinder()
tacit_finder = TacitFinder()
people_finder = PeopleFinder()
response_builder = ResponseBuilder()


class SearchRequest(BaseModel):
    prompt: Optional[str] = ""
    keywords: List[str]


@app.post("/search")
async def search(req: SearchRequest) -> List[SearchResult]:
    results = await info_finder.search(prompt=req.prompt or "", keywords=req.keywords or [])
    return results

@app.post("/tacit/search")
async def tacit_search(req: SearchRequest) -> List[SearchResult]:
    results = await tacit_finder.search(prompt=req.prompt or "", keywords=req.keywords or [])
    return results


class RunRequest(BaseModel):
    chatId: str
    prompt: str
    profile: Dict[str, Optional[str]]


@app.post("/agents/run")
async def run_agents(req: RunRequest) -> Dict[str, Any]:
    try:
        info = await keywords_finder.extract_keywords(req.prompt, req.profile)
        results = await info_finder.search(prompt=req.prompt, keywords=info.keywords)
        tacit_results = await tacit_finder.search(prompt=req.prompt, keywords=info.keywords)
        results.extend(tacit_results)
        # Select best matching person
        intermediate: IntermediateInfo = await people_finder.select_person(results, info.keywords)
        # Attach tacit knowledge summary to intermediate
        intermediate.tacit_knowledge = [{"title": r.get("title", ""), "snippet": r.get("snippet", "")} for r in tacit_results[:5]]
        
        content = await response_builder.build_response(intermediate, req.profile)
        return {
            "content": content,
            "debug": {
                "keywords": info.keywords,
                "selected_person": intermediate.selected_person,
                "search_summary": intermediate.search_summary,
                "tacit_knowledge": intermediate.tacit_knowledge,
            },
        }
    except Exception as e:
        logging.exception("Error during agent run")
        raise HTTPException(status_code=500, detail=str(e))
