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
import sys
import logging
from typing import Any, Dict

# Add parent directory to path to enable imports when run directly
_current_dir = os.path.dirname(os.path.abspath(__file__))
_strands_agents_dir = os.path.dirname(_current_dir)
_repo_root = os.path.dirname(_strands_agents_dir)

# Add both the repo root and strands_agents directory to the path
# This handles both local execution and Docker container scenarios
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _strands_agents_dir not in sys.path:
    sys.path.insert(0, _strands_agents_dir)

# For Docker container, also check if we need to add /app
_app_dir = "/app"
if os.path.exists(_app_dir) and _app_dir not in sys.path:
    sys.path.insert(0, _app_dir)

from bedrock_agentcore import BedrockAgentCoreApp

# Reuse internal service modules
try:
    # Try Docker container path first (when running in /app)
    from service.agents.keywords_finder import KeywordsFinder
    from service.agents.people_finder import PeopleFinder
    from service.agents.response_builder import ResponseBuilder
    from service.agents.info_finder import InfoFinder
    from service.agents.tacit_finder import TacitFinder
    from service.agents.ace_agent import ACEAgent
    from service.agents.checker_agent import CheckerAgent
    from service.agents.types import IntermediateInfo
    from service.config import load_config
    from service.orchestrator import AgentOrchestrator, OrchestrationStrategy
    from service.state_manager import AgentStateManager
    from service.agent_bus import AgentCommunicationBus, AgentMessage
    from service.monitoring import AgentMonitor
except ImportError:
    try:
        # Try strands_agents package path (when installed as package)
        from strands_agents.service.agents.keywords_finder import KeywordsFinder
        from strands_agents.service.agents.people_finder import PeopleFinder
        from strands_agents.service.agents.response_builder import ResponseBuilder
        from strands_agents.service.agents.info_finder import InfoFinder
        from strands_agents.service.agents.tacit_finder import TacitFinder
        from strands_agents.service.agents.ace_agent import ACEAgent
        from strands_agents.service.agents.checker_agent import CheckerAgent
        from strands_agents.service.agents.types import IntermediateInfo
        from strands_agents.service.config import load_config
        from strands_agents.service.orchestrator import AgentOrchestrator, OrchestrationStrategy
        from strands_agents.service.state_manager import AgentStateManager
        from strands_agents.service.agent_bus import AgentCommunicationBus, AgentMessage
        from strands_agents.service.monitoring import AgentMonitor
    except ImportError:
        # If executed inside the package where relative imports are needed
        from ..service.agents.keywords_finder import KeywordsFinder  # type: ignore
        from ..service.agents.people_finder import PeopleFinder  # type: ignore
        from ..service.agents.response_builder import ResponseBuilder  # type: ignore
        from ..service.agents.info_finder import InfoFinder  # type: ignore
        from ..service.agents.tacit_finder import TacitFinder  # type: ignore
        from ..service.agents.ace_agent import ACEAgent  # type: ignore
        from ..service.agents.checker_agent import CheckerAgent  # type: ignore
        from ..service.agents.types import IntermediateInfo  # type: ignore
        from ..service.config import load_config  # type: ignore
        from ..service.orchestrator import AgentOrchestrator, OrchestrationStrategy  # type: ignore
        from ..service.state_manager import AgentStateManager  # type: ignore
        from ..service.agent_bus import AgentCommunicationBus, AgentMessage  # type: ignore
        from ..service.monitoring import AgentMonitor  # type: ignore

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
checker_agent = CheckerAgent()  # Quality validation agent

# Initialize new StrandsAgents features
orchestrator = AgentOrchestrator(strategy=OrchestrationStrategy.SEQUENTIAL)
state_manager = AgentStateManager()
agent_bus = AgentCommunicationBus()
agent_monitor = AgentMonitor()

@app.entrypoint  # type: ignore[misc]
def invoke(payload: Dict[str, Any]):
    import time
    import asyncio
    
    start_time = time.time()
    prompt: str = payload.get("prompt") or payload.get("input") or "Hello! How can I help you today?"
    chat_id: str = payload.get("chatId") or payload.get("session_id") or "default"
    profile: Dict[str, Any] = payload.get("profile") or {}

    try:
        # Publish pipeline start event (using asyncio.run for sync context)
        asyncio.run(agent_bus.publish(AgentMessage(
            sender="orchestrator",
            topic="pipeline.start",
            data={
                "chatId": chat_id,
                "prompt": prompt[:100],
                "summary": f"Starting pipeline for chat {chat_id}"
            }
        )))
        
        # Load previous state for this chat
        previous_state = state_manager.load_state(chat_id, "main_pipeline")
        if previous_state:
            log.info(f"Loaded previous state for chat {chat_id}")
        
        # Get ACE context instructions
        ace_instructions = ace_agent.get_context_instructions(prompt, profile)
        
        # Initialize retry loop variables
        max_loops = 3
        loop_count = 0
        is_good = False
        final_content = ""
        final_intermediate = None
        validation_result = None
        optimization_history = []
        info = None
        results = []
        tacit_results = []
        
        # Main agent pipeline with quality check and retry loop
        while loop_count < max_loops and not is_good:
            loop_count += 1
            loop_start = time.time()
            
            # Step 1: Extract keywords
            agent_start = time.time()
            asyncio.run(agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "keywords_finder", "loop": loop_count, "summary": "Extracting keywords"}
            )))
            
            info = keywords_finder.extract_keywords_sync(prompt, profile) if hasattr(keywords_finder, 'extract_keywords_sync') else None
            if info is None:
                # fall back to async method executed synchronously
                info = asyncio.run(keywords_finder.extract_keywords(prompt, profile))  # type: ignore
            
            agent_monitor.record_execution(
                "keywords_finder",
                (time.time() - agent_start) * 1000,
                True,
                {"keywords_count": len(info.keywords)}
            )
            
            # Step 2 & 3: Search in parallel for better performance
            agent_start = time.time()
            asyncio.run(agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "search_parallel", "loop": loop_count, "summary": "Searching info and tacit knowledge"}
            )))
            
            # Run searches in parallel
            async def run_parallel_searches():
                return await asyncio.gather(
                    info_finder.search(prompt=prompt, keywords=info.keywords),
                    tacit_finder.search(prompt=prompt, keywords=info.keywords)
                )
            
            results, tacit_results = asyncio.run(run_parallel_searches())  # type: ignore
            
            search_time = (time.time() - agent_start) * 1000
            agent_monitor.record_execution(
                "info_finder",
                search_time / 2,  # Approximate split
                True,
                {"results_count": len(results)}
            )
            agent_monitor.record_execution(
                "tacit_finder",
                search_time / 2,
                True,
                {"results_count": len(tacit_results)}
            )
            
            # Step 4: Select best matching person
            agent_start = time.time()
            asyncio.run(agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "people_finder", "loop": loop_count, "summary": "Selecting best person"}
            )))
            
            intermediate: IntermediateInfo = asyncio.run(people_finder.select_person(results, info.keywords))  # type: ignore
            
            agent_monitor.record_execution(
                "people_finder",
                (time.time() - agent_start) * 1000,
                True,
                {"person": intermediate.selected_person}
            )
            
            # Attach tacit knowledge summary to intermediate
            intermediate.tacit_knowledge = [
                {"title": r.get("title", ""), "snippet": r.get("snippet", "")} 
                for r in tacit_results[:5]
            ]
            
            # Step 5: Build response
            agent_start = time.time()
            asyncio.run(agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "response_builder", "loop": loop_count, "summary": "Building response"}
            )))
            
            content = asyncio.run(response_builder.build_response(intermediate, profile, prompt))  # type: ignore
            
            agent_monitor.record_execution(
                "response_builder",
                (time.time() - agent_start) * 1000,
                True,
                {"response_length": len(content)}
            )
            
            # Step 6: Check response quality
            agent_start = time.time()
            validation_result = checker_agent.check(
                response=content,
                intermediate=intermediate,
                prompt=prompt,
                profile=profile
            )
            
            agent_monitor.record_execution(
                "checker_agent",
                (time.time() - agent_start) * 1000,
                True,
                {"score": validation_result.score, "is_good": validation_result.is_good}
            )
            
            is_good = validation_result.is_good
            final_content = content
            final_intermediate = intermediate
            
            # If not good and haven't exceeded max loops, optimize with ACE
            if not is_good and loop_count < max_loops:
                asyncio.run(agent_bus.publish(AgentMessage(
                    sender="orchestrator",
                    topic="validation.failed",
                    data={
                        "loop": loop_count,
                        "score": validation_result.score,
                        "feedback": validation_result.feedback,
                        "summary": "Response quality insufficient, optimizing"
                    }
                )))
                # Generate ACE context for optimization
                ace_context = ace_agent.generate(
                    query=prompt,
                    profile=profile,
                    keywords=info.keywords,
                    search_results=results,
                    tacit_results=tacit_results,
                    intermediate=intermediate
                )
                
                # Step 7: Optimize using ACE agent
                optimization = ace_agent.optimize(
                    context=ace_context,
                    validation_feedback=validation_result.feedback,
                    intermediate=intermediate,
                    loop_count=loop_count
                )
                
                optimization_history.append({
                    "loop": loop_count,
                    "score": validation_result.score,
                    "feedback": validation_result.feedback,
                    "optimization": optimization["focus_areas"],
                    "loop_time_ms": (time.time() - loop_start) * 1000
                })
                
                # Update ACE instructions for next iteration
                ace_instructions = ace_agent.get_context_instructions(prompt, profile)
        
        # Final ACE phases (Generation, Reflection, Curation) for learning
        execution_time_ms = (time.time() - start_time) * 1000
        
        ace_context = ace_agent.generate(
            query=prompt,
            profile=profile,
            keywords=info.keywords,
            search_results=results,
            tacit_results=tacit_results,
            intermediate=final_intermediate
        )
        
        ace_insights = ace_agent.reflect(
            context=ace_context,
            response=final_content,
            execution_time_ms=execution_time_ms
        )
        
        ace_deltas = ace_agent.curate(ace_insights)
        
        # Record overall pipeline execution
        agent_monitor.record_execution(
            "main_pipeline",
            execution_time_ms,
            validation_result.is_good,
            {
                "loops": loop_count,
                "validation_score": validation_result.score,
                "ace_deltas": len(ace_deltas)
            }
        )
        
        # Save state for next interaction
        state_manager.save_state(chat_id, "main_pipeline", {
            "last_keywords": info.keywords,
            "last_person": final_intermediate.selected_person,
            "validation_score": validation_result.score,
            "timestamp": time.time(),
            "loops_required": loop_count
        })
        
        # Publish pipeline complete event
        asyncio.run(agent_bus.publish(AgentMessage(
            sender="orchestrator",
            topic="pipeline.complete",
            data={
                "chatId": chat_id,
                "execution_time_ms": execution_time_ms,
                "loops": loop_count,
                "score": validation_result.score,
                "summary": f"Pipeline completed in {execution_time_ms:.0f}ms with score {validation_result.score}"
            }
        )))
        
        return {
            "result": final_content,
            "debug": {
                "keywords": info.keywords,
                "selected_person": final_intermediate.selected_person,
                "search_summary": final_intermediate.search_summary,
                "tacit_knowledge": final_intermediate.tacit_knowledge,
            },
            "validation": {
                "is_good": validation_result.is_good,
                "score": validation_result.score,
                "feedback": validation_result.feedback,
                "loops_executed": loop_count,
                "optimization_history": optimization_history
            },
            "ace": {
                "instructions_applied": ace_instructions if ace_instructions else "None",
                "quality_score": ace_insights.get("quality_indicators", {}).get("overall_score", 0),
                "patterns_found": len(ace_insights.get("patterns", [])),
                "suggestions": ace_insights.get("suggestions", []),
                "deltas_added": len(ace_deltas)
            },
            "performance": {
                "total_time_ms": execution_time_ms,
                "previous_state_loaded": previous_state is not None
            },
            "chatId": chat_id,
        }
    except Exception as e:  # pragma: no cover - defensive
        agent_monitor.record_error("main_pipeline", e, {"chatId": chat_id, "prompt": prompt[:100]})
        log.exception("Invocation failed")
        return {"error": str(e), "chatId": chat_id}

if __name__ == "__main__":  # Manual local test via: python strands_agent_entrypoint.py
    # Provide a tiny self-test
    sample = invoke({"prompt": "Explain internal knowledge flow", "profile": {"role": "PM"}})
    print(sample)
