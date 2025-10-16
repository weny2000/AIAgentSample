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
    from .agents.ace_agent import ACEAgent
    from .agents.types import SearchResult, IntermediateInfo
except ImportError:
    # Fall back to fully-qualified package imports (when run directly)
    from strands_agents.service.config import load_config
    from strands_agents.service.agents.keywords_finder import KeywordsFinder
    from strands_agents.service.agents.people_finder import PeopleFinder
    from strands_agents.service.agents.response_builder import ResponseBuilder
    from strands_agents.service.agents.info_finder import InfoFinder
    from strands_agents.service.agents.tacit_finder import TacitFinder
    from strands_agents.service.agents.ace_agent import ACEAgent
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
ace_agent = ACEAgent()  # ACE agent for context engineering


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
    import time
    start_time = time.time()
    
    try:
        # Get ACE context instructions for this query
        ace_instructions = ace_agent.get_context_instructions(req.prompt, req.profile)
        
        # Execute agent pipeline
        info = await keywords_finder.extract_keywords(req.prompt, req.profile)
        results = await info_finder.search(prompt=req.prompt, keywords=info.keywords)
        tacit_results = await tacit_finder.search(prompt=req.prompt, keywords=info.keywords)
        
        # Select best matching person
        intermediate: IntermediateInfo = await people_finder.select_person(results, info.keywords)
        # Attach tacit knowledge summary to intermediate
        intermediate.tacit_knowledge = [{"title": r.get("title", ""), "snippet": r.get("snippet", "")} for r in tacit_results[:5]]
        
        content = await response_builder.build_response(intermediate, req.profile, req.prompt)
        
        # ACE Generation Phase: Create context from execution
        ace_context = ace_agent.generate(
            query=req.prompt,
            profile=req.profile,
            keywords=info.keywords,
            search_results=results,
            tacit_results=tacit_results,
            intermediate=intermediate
        )
        
        # ACE Reflection Phase: Analyze results
        execution_time_ms = (time.time() - start_time) * 1000
        ace_insights = ace_agent.reflect(
            context=ace_context,
            response=content,
            execution_time_ms=execution_time_ms
        )
        
        # ACE Curation Phase: Update context store
        ace_deltas = ace_agent.curate(ace_insights)
        
        return {
            "content": content,
            "debug": {
                "keywords": info.keywords,
                "selected_person": intermediate.selected_person,
                "search_summary": intermediate.search_summary,
                "tacit_knowledge": intermediate.tacit_knowledge,
            },
            "ace": {
                "instructions_applied": ace_instructions if ace_instructions else "None",
                "quality_score": ace_insights.get("quality_indicators", {}).get("overall_score", 0),
                "patterns_found": len(ace_insights.get("patterns", [])),
                "suggestions": ace_insights.get("suggestions", []),
                "deltas_added": len(ace_deltas)
            }
        }
    except Exception as e:
        logging.exception("Error during agent run")
        raise HTTPException(status_code=500, detail=str(e))


# ========== ACE Agent Endpoints ==========

@app.get("/ace/stats")
async def ace_statistics() -> Dict[str, Any]:
    """Get ACE agent statistics and performance metrics"""
    return ace_agent.get_statistics()


@app.get("/ace/context")
async def ace_context_store() -> Dict[str, Any]:
    """Get the full ACE context store"""
    return {
        "items": ace_agent.context_store,
        "count": len(ace_agent.context_store)
    }


class ACEInstructionsRequest(BaseModel):
    query: Optional[str] = ""
    profile: Optional[Dict[str, Optional[str]]] = None


@app.post("/ace/instructions")
async def ace_instructions(req: ACEInstructionsRequest) -> Dict[str, Any]:
    """Get ACE context instructions for a given query and profile"""
    instructions = ace_agent.get_context_instructions(
        query=req.query or "",
        profile=req.profile or {}
    )
    return {
        "instructions": instructions,
        "has_instructions": bool(instructions)
    }


@app.delete("/ace/context")
async def ace_clear_context() -> Dict[str, Any]:
    """Clear the ACE context store (admin endpoint)"""
    count = len(ace_agent.context_store)
    ace_agent.context_store = []
    ace_agent._save_context_store()
    return {
        "message": "ACE context store cleared",
        "items_removed": count
    }
