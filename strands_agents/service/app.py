from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import os
import asyncio
import time

try:
    # Try relative imports first (when run as module)
    from .config import load_config
    from .agents.keywords_finder import KeywordsFinder
    from .agents.people_finder import PeopleFinder
    from .agents.response_builder import ResponseBuilder
    from .agents.info_finder import InfoFinder
    from .agents.tacit_finder import TacitFinder
    from .agents.ace_agent import ACEAgent
    from .agents.checker_agent import CheckerAgent
    from .agents.types import SearchResult, IntermediateInfo
    from .orchestrator import AgentOrchestrator, OrchestrationStrategy
    from .state_manager import AgentStateManager
    from .agent_bus import AgentCommunicationBus, AgentMessage
    from .monitoring import AgentMonitor
except ImportError:
    # Fall back to fully-qualified package imports (when run directly)
    from strands_agents.service.config import load_config
    from strands_agents.service.agents.keywords_finder import KeywordsFinder
    from strands_agents.service.agents.people_finder import PeopleFinder
    from strands_agents.service.agents.response_builder import ResponseBuilder
    from strands_agents.service.agents.info_finder import InfoFinder
    from strands_agents.service.agents.tacit_finder import TacitFinder
    from strands_agents.service.agents.ace_agent import ACEAgent
    from strands_agents.service.agents.checker_agent import CheckerAgent
    from strands_agents.service.agents.types import SearchResult, IntermediateInfo
    from strands_agents.service.orchestrator import AgentOrchestrator, OrchestrationStrategy
    from strands_agents.service.state_manager import AgentStateManager
    from strands_agents.service.agent_bus import AgentCommunicationBus, AgentMessage
    from strands_agents.service.monitoring import AgentMonitor

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

app = FastAPI(title="StrandsAgents API", version="2.0.0")

# Initialize agents at startup to load models and data only once
keywords_finder = KeywordsFinder()
info_finder = InfoFinder()
tacit_finder = TacitFinder()
people_finder = PeopleFinder()
response_builder = ResponseBuilder()
ace_agent = ACEAgent()  # ACE agent for context engineering
checker_agent = CheckerAgent()  # Quality validation agent

# Initialize new StrandsAgents features
orchestrator = AgentOrchestrator(strategy=OrchestrationStrategy.SEQUENTIAL)
state_manager = AgentStateManager()
agent_bus = AgentCommunicationBus()
agent_monitor = AgentMonitor()

# Set up event subscriptions
async def log_agent_event(message: AgentMessage):
    """Log agent events"""
    logging.info(f"[Event] {message.sender} -> {message.topic}: {message.data.get('summary', '')}")

agent_bus.subscribe("pipeline.start", log_agent_event)
agent_bus.subscribe("pipeline.complete", log_agent_event)
agent_bus.subscribe("agent.execute", log_agent_event)
agent_bus.subscribe("validation.failed", log_agent_event)


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
    start_time = time.time()
    
    try:
        # Publish pipeline start event
        await agent_bus.publish(AgentMessage(
            sender="orchestrator",
            topic="pipeline.start",
            data={
                "chatId": req.chatId,
                "prompt": req.prompt[:100],
                "summary": f"Starting pipeline for chat {req.chatId}"
            }
        ))
        
        # Load previous state for this chat
        previous_state = state_manager.load_state(req.chatId, "main_pipeline")
        if previous_state:
            logging.info(f"Loaded previous state for chat {req.chatId}")
        
        # Get ACE context instructions for this query
        ace_instructions = ace_agent.get_context_instructions(req.prompt, req.profile)
        
        # Initialize retry loop variables
        max_loops = 3
        loop_count = 0
        is_good = False
        final_content = ""
        final_intermediate = None
        validation_result = None
        optimization_history = []
        
        # Main agent pipeline with quality check and retry loop
        while loop_count < max_loops and not is_good:
            loop_count += 1
            loop_start = time.time()
            
            # Step 1: Extract keywords
            agent_start = time.time()
            await agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "keywords_finder", "loop": loop_count, "summary": "Extracting keywords"}
            ))
            info = await keywords_finder.extract_keywords(req.prompt, req.profile)
            agent_monitor.record_execution(
                "keywords_finder",
                (time.time() - agent_start) * 1000,
                True,
                {"keywords_count": len(info.keywords)}
            )
            
            # Step 2 & 3: Search in parallel for better performance
            agent_start = time.time()
            await agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "search_parallel", "loop": loop_count, "summary": "Searching info and tacit knowledge"}
            ))
            
            results, tacit_results = await asyncio.gather(
                info_finder.search(prompt=req.prompt, keywords=info.keywords),
                tacit_finder.search(prompt=req.prompt, keywords=info.keywords)
            )
            
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
            await agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "people_finder", "loop": loop_count, "summary": "Selecting best person"}
            ))
            intermediate: IntermediateInfo = await people_finder.select_person(results, info.keywords)
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
            intermediate.search_summary = [
                {"title": r.get("title", ""), "snippet": r.get("snippet", "")}
                for r in results[:5]
            ]

            
            # Step 5: Build response
            agent_start = time.time()
            await agent_bus.publish(AgentMessage(
                sender="orchestrator",
                topic="agent.execute",
                data={"agent": "response_builder", "loop": loop_count, "summary": "Building response"}
            ))
            content = await response_builder.build_response(intermediate, req.profile, req.prompt)
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
                prompt=req.prompt,
                profile=req.profile
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
                await agent_bus.publish(AgentMessage(
                    sender="orchestrator",
                    topic="validation.failed",
                    data={
                        "loop": loop_count,
                        "score": validation_result.score,
                        "feedback": validation_result.feedback,
                        "summary": "Response quality insufficient, optimizing"
                    }
                ))
                
                # Generate ACE context for optimization
                ace_context = ace_agent.generate(
                    query=req.prompt,
                    profile=req.profile,
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
                    "optimization": optimization["focus_areas"]
                })
                
                # Update ACE instructions for next iteration
                ace_instructions = ace_agent.get_context_instructions(req.prompt, req.profile)
        
        # Final ACE phases (Generation, Reflection, Curation) for learning
        execution_time_ms = (time.time() - start_time) * 1000
        
        ace_context = ace_agent.generate(
            query=req.prompt,
            profile=req.profile,
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
        state_manager.save_state(req.chatId, "main_pipeline", {
            "last_keywords": info.keywords,
            "last_person": final_intermediate.selected_person,
            "validation_score": validation_result.score,
            "timestamp": time.time(),
            "loops_required": loop_count
        })
        
        # Publish pipeline complete event
        await agent_bus.publish(AgentMessage(
            sender="orchestrator",
            topic="pipeline.complete",
            data={
                "chatId": req.chatId,
                "execution_time_ms": execution_time_ms,
                "loops": loop_count,
                "score": validation_result.score,
                "summary": f"Pipeline completed in {execution_time_ms:.0f}ms with score {validation_result.score}"
            }
        ))
        
        return {
            "content": final_content,
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
            }
        }
    except Exception as e:
        agent_monitor.record_error("main_pipeline", e, {"chatId": req.chatId, "prompt": req.prompt[:100]})
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


# ========== Enhanced StrandsAgents Endpoints ==========

@app.get("/monitoring/stats")
async def get_monitoring_stats(agent: Optional[str] = None, time_window: Optional[int] = None) -> Dict[str, Any]:
    """Get agent performance statistics
    
    Args:
        agent: Optional agent name to filter by
        time_window: Optional time window in seconds
    """
    return agent_monitor.get_statistics(agent, time_window)


@app.get("/monitoring/errors")
async def get_monitoring_errors(agent: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
    """Get recent agent errors"""
    return {
        "errors": agent_monitor.get_errors(agent, limit),
        "total_count": len(agent_monitor.get_errors(agent, 999999))
    }


@app.delete("/monitoring/metrics")
async def clear_monitoring_metrics(agent: Optional[str] = None) -> Dict[str, Any]:
    """Clear monitoring metrics"""
    agent_monitor.clear_metrics(agent)
    return {"message": f"Metrics cleared for {'all agents' if not agent else agent}"}


@app.get("/state/{chatId}")
async def get_chat_state(chatId: str) -> Dict[str, Any]:
    """Get saved state for a chat session"""
    state = state_manager.load_state(chatId, "main_pipeline")
    if state:
        return {"chatId": chatId, "state": state, "exists": True}
    return {"chatId": chatId, "state": None, "exists": False}


@app.delete("/state/{chatId}")
async def clear_chat_state(chatId: str) -> Dict[str, Any]:
    """Clear saved state for a chat session"""
    state_manager.clear_state(chatId)
    return {"message": f"State cleared for chat {chatId}"}


@app.get("/state")
async def list_chat_states() -> Dict[str, Any]:
    """List all chat sessions with saved state"""
    chats = state_manager.list_chats()
    return {"chats": chats, "count": len(chats)}


@app.get("/bus/history")
async def get_bus_history(topic: Optional[str] = None, sender: Optional[str] = None, limit: Optional[int] = 100) -> Dict[str, Any]:
    """Get agent communication history"""
    messages = agent_bus.get_history(topic, sender, limit)
    return {
        "messages": [m.to_dict() for m in messages],
        "count": len(messages)
    }


@app.get("/bus/topics")
async def get_bus_topics() -> Dict[str, Any]:
    """Get all active communication topics"""
    topics = agent_bus.get_topics()
    return {"topics": topics, "count": len(topics)}


@app.delete("/bus/history")
async def clear_bus_history() -> Dict[str, Any]:
    """Clear agent communication history"""
    agent_bus.clear_history()
    return {"message": "Communication history cleared"}


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "features": {
            "orchestration": True,
            "state_management": True,
            "communication_bus": True,
            "monitoring": True,
            "ace": True
        }
    }
