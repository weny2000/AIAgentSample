# Marks 'strands_agents' as a Python package to support relative imports.
# Having this file ensures uvicorn can import modules like 'strands_agents.service.app'.

__all__ = ["service", "config", "data"]
