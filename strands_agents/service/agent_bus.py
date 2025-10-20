"""Agent Communication Bus Module

Enables pub-sub communication between agents for event-driven architecture.
"""
from typing import Dict, List, Callable, Any, Optional
import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class AgentMessage:
    """Message passed between agents"""
    
    def __init__(self, sender: str, topic: str, data: Dict[str, Any]):
        self.sender = sender
        self.topic = topic
        self.data = data
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "sender": self.sender,
            "topic": self.topic,
            "data": self.data,
            "timestamp": self.timestamp
        }


class AgentCommunicationBus:
    """Enables pub-sub communication between agents"""
    
    def __init__(self, max_history: int = 1000):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.message_history: List[AgentMessage] = []
        self.max_history = max_history
        logger.info("Initialized agent communication bus")
    
    def subscribe(self, topic: str, callback: Callable):
        """Subscribe to a topic"""
        if topic not in self.subscribers:
            self.subscribers[topic] = []
        self.subscribers[topic].append(callback)
        logger.debug(f"Subscribed to topic: {topic}")
    
    def unsubscribe(self, topic: str, callback: Callable):
        """Unsubscribe from a topic"""
        if topic in self.subscribers and callback in self.subscribers[topic]:
            self.subscribers[topic].remove(callback)
            logger.debug(f"Unsubscribed from topic: {topic}")
    
    async def publish(self, message: AgentMessage):
        """Publish a message to subscribers"""
        self.message_history.append(message)
        
        # Limit history size
        if len(self.message_history) > self.max_history:
            self.message_history = self.message_history[-self.max_history:]
        
        logger.debug(f"Published message: {message.sender} -> {message.topic}")
        
        # Notify subscribers
        if message.topic in self.subscribers:
            tasks = []
            for callback in self.subscribers[message.topic]:
                try:
                    tasks.append(callback(message))
                except Exception as e:
                    logger.error(f"Error in subscriber callback: {str(e)}")
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
    
    def get_history(self, topic: Optional[str] = None, sender: Optional[str] = None, 
                   limit: Optional[int] = None) -> List[AgentMessage]:
        """Get message history, optionally filtered"""
        messages = self.message_history
        
        if topic:
            messages = [m for m in messages if m.topic == topic]
        
        if sender:
            messages = [m for m in messages if m.sender == sender]
        
        if limit:
            messages = messages[-limit:]
        
        return messages
    
    def clear_history(self):
        """Clear message history"""
        count = len(self.message_history)
        self.message_history = []
        logger.info(f"Cleared {count} messages from history")
    
    def get_topics(self) -> List[str]:
        """Get all active topics"""
        return list(self.subscribers.keys())
