"""Agent Orchestration Module

Provides different strategies for executing agents in the StrandsAgents pipeline.
"""
from enum import Enum
from typing import Protocol, List, Dict, Any, Callable
import asyncio
import logging

logger = logging.getLogger(__name__)


class OrchestrationStrategy(Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"
    HYBRID = "hybrid"


class Agent(Protocol):
    """Protocol for agent interface"""
    async def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        ...
    
    async def should_execute(self, context: Dict[str, Any]) -> bool:
        ...


class AgentOrchestrator:
    """Orchestrates agent execution with different strategies"""
    
    def __init__(self, strategy: OrchestrationStrategy = OrchestrationStrategy.SEQUENTIAL):
        self.strategy = strategy
        self.agents: List[Dict[str, Any]] = []
        
    def add_agent(self, name: str, agent: Callable, condition: Callable = None):
        """Add an agent to the orchestration pipeline"""
        self.agents.append({
            "name": name,
            "agent": agent,
            "condition": condition or (lambda ctx: True)
        })
        
    async def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agents based on selected strategy"""
        if self.strategy == OrchestrationStrategy.SEQUENTIAL:
            return await self.execute_sequential(context)
        elif self.strategy == OrchestrationStrategy.PARALLEL:
            return await self.execute_parallel(context)
        elif self.strategy == OrchestrationStrategy.CONDITIONAL:
            return await self.execute_conditional(context)
        elif self.strategy == OrchestrationStrategy.HYBRID:
            return await self.execute_hybrid(context)
        else:
            raise ValueError(f"Unknown strategy: {self.strategy}")
    
    async def execute_sequential(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agents in sequence, passing output to next"""
        result = context.copy()
        
        for agent_info in self.agents:
            try:
                logger.info(f"Executing agent: {agent_info['name']}")
                agent_result = await agent_info["agent"](result)
                result.update(agent_result)
            except Exception as e:
                logger.error(f"Error in agent {agent_info['name']}: {str(e)}")
                result["errors"] = result.get("errors", [])
                result["errors"].append({
                    "agent": agent_info["name"],
                    "error": str(e)
                })
        
        return result
    
    async def execute_parallel(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute all agents in parallel and merge results"""
        tasks = []
        agent_names = []
        
        for agent_info in self.agents:
            tasks.append(agent_info["agent"](context))
            agent_names.append(agent_info["name"])
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        merged = context.copy()
        for name, result in zip(agent_names, results):
            if isinstance(result, Exception):
                logger.error(f"Error in agent {name}: {str(result)}")
                merged["errors"] = merged.get("errors", [])
                merged["errors"].append({"agent": name, "error": str(result)})
            else:
                merged.update(result)
        
        return merged
    
    async def execute_conditional(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agents based on conditions"""
        result = context.copy()
        
        for agent_info in self.agents:
            try:
                if agent_info["condition"](result):
                    logger.info(f"Executing conditional agent: {agent_info['name']}")
                    agent_result = await agent_info["agent"](result)
                    result.update(agent_result)
                else:
                    logger.info(f"Skipping agent: {agent_info['name']}")
            except Exception as e:
                logger.error(f"Error in agent {agent_info['name']}: {str(e)}")
                result["errors"] = result.get("errors", [])
                result["errors"].append({"agent": agent_info["name"], "error": str(e)})
        
        return result
    
    async def execute_hybrid(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute with hybrid strategy: parallel where possible, sequential otherwise"""
        result = context.copy()
        parallel_agents = []
        
        for agent_info in self.agents:
            # If agent has dependencies (checks context), run sequentially
            # Otherwise, can run in parallel
            if self._has_dependencies(agent_info):
                # Run any pending parallel agents first
                if parallel_agents:
                    parallel_result = await self._run_parallel_batch(parallel_agents, result)
                    result.update(parallel_result)
                    parallel_agents = []
                
                # Run this agent sequentially
                try:
                    logger.info(f"Executing sequential agent: {agent_info['name']}")
                    agent_result = await agent_info["agent"](result)
                    result.update(agent_result)
                except Exception as e:
                    logger.error(f"Error in agent {agent_info['name']}: {str(e)}")
                    result["errors"] = result.get("errors", [])
                    result["errors"].append({"agent": agent_info["name"], "error": str(e)})
            else:
                parallel_agents.append(agent_info)
        
        # Run any remaining parallel agents
        if parallel_agents:
            parallel_result = await self._run_parallel_batch(parallel_agents, result)
            result.update(parallel_result)
        
        return result
    
    def _has_dependencies(self, agent_info: Dict[str, Any]) -> bool:
        """Check if agent has dependencies on previous results"""
        # Simple heuristic: if condition function is not default, it has dependencies
        return agent_info["condition"].__name__ != "<lambda>"
    
    async def _run_parallel_batch(self, agents: List[Dict[str, Any]], context: Dict[str, Any]) -> Dict[str, Any]:
        """Run a batch of agents in parallel"""
        tasks = [agent["agent"](context) for agent in agents]
        agent_names = [agent["name"] for agent in agents]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        merged = {}
        for name, result in zip(agent_names, results):
            if isinstance(result, Exception):
                logger.error(f"Error in parallel agent {name}: {str(result)}")
                merged["errors"] = merged.get("errors", [])
                merged["errors"].append({"agent": name, "error": str(result)})
            else:
                merged.update(result)
        
        return merged
