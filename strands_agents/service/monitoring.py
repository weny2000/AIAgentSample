"""Agent Monitoring Module

Provides comprehensive monitoring and telemetry for agent performance.
"""
from typing import Dict, Any, List, Optional
import time
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class AgentMonitor:
    """Monitor agent performance and health"""
    
    def __init__(self, max_metrics: int = 10000):
        self.metrics: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.errors: List[Dict[str, Any]] = []
        self.max_metrics = max_metrics
        logger.info("Initialized agent monitor")
    
    def record_execution(self, agent_name: str, execution_time_ms: float, 
                        success: bool, metadata: Dict[str, Any] = None):
        """Record agent execution metrics"""
        self.metrics[agent_name].append({
            "timestamp": time.time(),
            "execution_time_ms": execution_time_ms,
            "success": success,
            "metadata": metadata or {}
        })
        
        # Limit metrics size per agent
        if len(self.metrics[agent_name]) > self.max_metrics:
            self.metrics[agent_name] = self.metrics[agent_name][-self.max_metrics:]
        
        logger.debug(f"Recorded execution for {agent_name}: {execution_time_ms:.2f}ms")
    
    def record_error(self, agent_name: str, error: Exception, context: Dict[str, Any]):
        """Record agent errors"""
        self.errors.append({
            "timestamp": time.time(),
            "agent": agent_name,
            "error": str(error),
            "error_type": type(error).__name__,
            "context": context
        })
        
        # Limit error history
        if len(self.errors) > self.max_metrics:
            self.errors = self.errors[-self.max_metrics:]
        
        logger.error(f"Recorded error for {agent_name}: {str(error)}")
    
    def get_statistics(self, agent_name: Optional[str] = None, 
                      time_window_seconds: Optional[float] = None) -> Dict[str, Any]:
        """Get performance statistics"""
        if agent_name:
            metrics = self.metrics.get(agent_name, [])
            return self._calculate_stats(agent_name, metrics, time_window_seconds)
        
        return {
            agent: self._calculate_stats(agent, metrics, time_window_seconds)
            for agent, metrics in self.metrics.items()
        }
    
    def _calculate_stats(self, agent_name: str, metrics: List[Dict[str, Any]], 
                        time_window_seconds: Optional[float] = None) -> Dict[str, Any]:
        """Calculate statistics for an agent"""
        if not metrics:
            return {
                "agent": agent_name,
                "count": 0,
                "success_rate": 0.0,
                "avg_time_ms": 0.0,
                "min_time_ms": 0.0,
                "max_time_ms": 0.0
            }
        
        # Filter by time window if specified
        if time_window_seconds:
            cutoff_time = time.time() - time_window_seconds
            metrics = [m for m in metrics if m["timestamp"] >= cutoff_time]
        
        if not metrics:
            return {
                "agent": agent_name,
                "count": 0,
                "success_rate": 0.0,
                "avg_time_ms": 0.0,
                "min_time_ms": 0.0,
                "max_time_ms": 0.0
            }
        
        times = [m["execution_time_ms"] for m in metrics]
        successes = sum(1 for m in metrics if m["success"])
        
        return {
            "agent": agent_name,
            "count": len(metrics),
            "success_rate": successes / len(metrics),
            "avg_time_ms": sum(times) / len(times),
            "min_time_ms": min(times),
            "max_time_ms": max(times),
            "p50_time_ms": self._percentile(times, 0.5),
            "p95_time_ms": self._percentile(times, 0.95),
            "p99_time_ms": self._percentile(times, 0.99)
        }
    
    def _percentile(self, values: List[float], percentile: float) -> float:
        """Calculate percentile"""
        if not values:
            return 0.0
        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile)
        return sorted_values[min(index, len(sorted_values) - 1)]
    
    def get_errors(self, agent_name: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent errors"""
        errors = self.errors
        
        if agent_name:
            errors = [e for e in errors if e["agent"] == agent_name]
        
        return errors[-limit:]
    
    def clear_metrics(self, agent_name: Optional[str] = None):
        """Clear metrics"""
        if agent_name:
            if agent_name in self.metrics:
                del self.metrics[agent_name]
            logger.info(f"Cleared metrics for {agent_name}")
        else:
            self.metrics.clear()
            logger.info("Cleared all metrics")
    
    def clear_errors(self):
        """Clear error history"""
        count = len(self.errors)
        self.errors = []
        logger.info(f"Cleared {count} errors")
