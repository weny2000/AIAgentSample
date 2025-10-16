"""AgentCore Runtime entrypoint integrating existing Strands multi-agent pipeline.

This wraps the existing FastAPI logic-less agent orchestration in `service/agents/*` into a
Bedrock AgentCore invocable function so it can be deployed via the AgentCore Starter Toolkit.

Invocation contract (simplified):
Input payload JSON fields (all optional, with sensible defaults):
  prompt: str - user prompt
  chatId: str - conversation identifier
  profile: dict - user profile with role / skills

Response JSON:
  result: str - final markdown content
  debug: {...} - same debug block as original /agents/run endpoint (keywords, selected_person, etc.)

This file intentionally keeps minimal dependencies and reuses existing initialization logic.
"""
from __future__ import annotations

import os
import logging
from typing import Any, Dict

from bedrock_agentcore import BedrockAgentCoreApp

# Reuse internal service modules
try:
    from strands_agents.service.agents.keywords_finder import KeywordsFinder
    from strands_agents.service.agents.people_finder import PeopleFinder
    from strands_agents.service.agents.response_builder import ResponseBuilder
    from strands_agents.service.agents.info_finder import InfoFinder
    from strands_agents.service.agents.tacit_finder import TacitFinder
    from strands_agents.service.agents.ace_agent import ACEAgent
    from strands_agents.service.agents.types import IntermediateInfo
    from strands_agents.service.config import load_config
except ImportError:
    # If executed inside the package where relative imports are needed
    from ..service.agents.keywords_finder import KeywordsFinder  # type: ignore
    from ..service.agents.people_finder import PeopleFinder  # type: ignore
    from ..service.agents.response_builder import ResponseBuilder  # type: ignore
    from ..service.agents.info_finder import InfoFinder  # type: ignore
    from ..service.agents.tacit_finder import TacitFinder  # type: ignore
    from ..service.agents.ace_agent import ACEAgent  # type: ignore
    from ..service.agents.types import IntermediateInfo  # type: ignore
    from ..service.config import load_config  # type: ignore

# Load environment (.env) just like FastAPI service does
load_config()

log = logging.getLogger(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = BedrockAgentCoreApp()

# Initialize once at cold start
keywords_finder = KeywordsFinder()
info_finder = InfoFinder()
people_finder = PeopleFinder()
response_builder = ResponseBuilder()
tacit_finder = TacitFinder()
ace_agent = ACEAgent()  # ACE agent for context engineering

@app.entrypoint  # type: ignore[misc]
def invoke(payload: Dict[str, Any]):
    import time
    import asyncio
    
    start_time = time.time()
    prompt: str = payload.get("prompt") or payload.get("input") or "Hello! How can I help you today?"
    chat_id: str = payload.get("chatId") or payload.get("session_id") or "default"
    profile: Dict[str, Any] = payload.get("profile") or {}

    try:
        # Get ACE context instructions
        ace_instructions = ace_agent.get_context_instructions(prompt, profile)
        
        # Execute keyword extraction
        info = keywords_finder.extract_keywords_sync(prompt, profile) if hasattr(keywords_finder, 'extract_keywords_sync') else None
        if info is None:
            # fall back to async method executed synchronously
            info = asyncio.run(keywords_finder.extract_keywords(prompt, profile))  # type: ignore
        
        # Search (can be async, so run in loop)
        results = asyncio.run(info_finder.search(prompt=prompt, keywords=info.keywords))  # type: ignore
        tacit_results = asyncio.run(tacit_finder.search(prompt=prompt, keywords=info.keywords))  # type: ignore
        
        # Select person and build response
        intermediate: IntermediateInfo = asyncio.run(people_finder.select_person(results, info.keywords))  # type: ignore
        intermediate.tacit_knowledge = [
            {"title": r.get("title", ""), "snippet": r.get("snippet", "")} for r in tacit_results[:5]
        ]
        content = asyncio.run(response_builder.build_response(intermediate, profile, prompt))  # type: ignore
        
        # ACE Generation Phase
        ace_context = ace_agent.generate(
            query=prompt,
            profile=profile,
            keywords=info.keywords,
            search_results=results,
            tacit_results=tacit_results,
            intermediate=intermediate
        )
        
        # ACE Reflection Phase
        execution_time_ms = (time.time() - start_time) * 1000
        ace_insights = ace_agent.reflect(
            context=ace_context,
            response=content,
            execution_time_ms=execution_time_ms
        )
        
        # ACE Curation Phase
        ace_deltas = ace_agent.curate(ace_insights)
        
        return {
            "result": content,
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
            },
            "chatId": chat_id,
        }
    except Exception as e:  # pragma: no cover - defensive
        log.exception("Invocation failed")
        return {"error": str(e), "chatId": chat_id}

if __name__ == "__main__":  # Manual local test via: python strands_agent_entrypoint.py
    # Provide a tiny self-test
    sample = invoke({"prompt": "Explain internal knowledge flow", "profile": {"role": "PM"}})
    print(sample)
