"""Agent State Management Module

Provides persistent state management for agents across chat sessions.
"""
from typing import Dict, Any, Optional
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class AgentStateManager:
    """Manages persistent state for agents across requests"""
    
    def __init__(self, state_dir: str = "agent_states"):
        self.state_dir = Path(__file__).parent / state_dir
        self.state_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized state manager at {self.state_dir}")
    
    def save_state(self, chat_id: str, agent_name: str, state: Dict[str, Any]):
        """Save agent state for a chat session"""
        try:
            state_file = self.state_dir / f"{chat_id}_{agent_name}.json"
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
            logger.debug(f"Saved state for {chat_id}/{agent_name}")
        except Exception as e:
            logger.error(f"Error saving state for {chat_id}/{agent_name}: {str(e)}")
    
    def load_state(self, chat_id: str, agent_name: str) -> Optional[Dict[str, Any]]:
        """Load agent state for a chat session"""
        try:
            state_file = self.state_dir / f"{chat_id}_{agent_name}.json"
            if state_file.exists():
                with open(state_file, 'r') as f:
                    state = json.load(f)
                logger.debug(f"Loaded state for {chat_id}/{agent_name}")
                return state
            return None
        except Exception as e:
            logger.error(f"Error loading state for {chat_id}/{agent_name}: {str(e)}")
            return None
    
    def clear_state(self, chat_id: str):
        """Clear all states for a chat session"""
        try:
            count = 0
            for state_file in self.state_dir.glob(f"{chat_id}_*.json"):
                state_file.unlink()
                count += 1
            logger.info(f"Cleared {count} state files for {chat_id}")
        except Exception as e:
            logger.error(f"Error clearing state for {chat_id}: {str(e)}")
    
    def list_chats(self) -> list:
        """List all chat IDs with saved state"""
        chat_ids = set()
        for state_file in self.state_dir.glob("*_*.json"):
            chat_id = state_file.stem.split("_")[0]
            chat_ids.add(chat_id)
        return sorted(list(chat_ids))
