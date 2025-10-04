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
    from .agents.info_collector import InfoCollector
    from .agents.people_finder import PeopleFinder
    from .agents.response_builder import ResponseBuilder
    from .agents.search_client import SearchClient
    from .agents.types import SearchResult, IntermediateInfo
except ImportError:
    # Fall back to absolute imports (when run directly)
    from config import load_config
    from agents.info_collector import InfoCollector
    from agents.people_finder import PeopleFinder
    from agents.response_builder import ResponseBuilder
    from agents.search_client import SearchClient
    from agents.types import SearchResult, IntermediateInfo

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


class SearchRequest(BaseModel):
    keywords: List[str]


@app.post("/search")
async def search(req: SearchRequest) -> List[SearchResult]:
    results = await SearchClient().search(req.keywords or [])
    return results


class RunRequest(BaseModel):
    chatId: str
    prompt: str
    profile: Dict[str, Optional[str]]


@app.post("/agents/run")
async def run_agents(req: RunRequest) -> Dict[str, Any]:
    try:
        info = await InfoCollector().extract_keywords(req.prompt, req.profile)
        results = await SearchClient().search(info.keywords)
        intermediate: IntermediateInfo = await PeopleFinder().select_person(results, info.keywords)
        content = await ResponseBuilder().build_response(intermediate, req.profile)
        return {
            "content": content,
            "debug": {
                "keywords": info.keywords,
                "selected_person": intermediate.selected_person,
                "search_summary": intermediate.search_summary,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
