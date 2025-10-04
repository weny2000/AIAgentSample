import os
import logging

logger = logging.getLogger(__name__)

# Import each optional provider separately so a failure in one doesn't mask others.
try:  # Bedrock (AWS) provider
    from strands_agents.models import BedrockModel  # type: ignore
except Exception as e:  # pragma: no cover - defensive
    logger.debug("BedrockModel import failed: %s", e)
    try:
        from strands.models import BedrockModel  # type: ignore  # legacy fallback
    except Exception as e2:
        logger.debug("BedrockModel legacy import failed: %s", e2)
        BedrockModel = None  # type: ignore

try:  # Ollama (local) provider
    from strands_agents.models.ollama import OllamaModel  # type: ignore
except Exception as e:  # pragma: no cover - defensive
    logger.debug("OllamaModel import failed: %s", e)
    try:
        from strands.models.ollama import OllamaModel  # type: ignore  # legacy fallback
    except Exception as e2:
        logger.debug("OllamaModel legacy import failed: %s", e2)
        OllamaModel = None  # type: ignore

try:  # OpenAI-compatible provider
    from strands_agents.models.openai import OpenAIModel  # type: ignore
except Exception as e:  # pragma: no cover - defensive
    logger.debug("OpenAIModel import failed: %s", e)
    try:
        from strands.models.openai import OpenAIModel  # type: ignore  # legacy fallback
    except Exception as e2:
        logger.debug("OpenAIModel legacy import failed: %s", e2)
        OpenAIModel = None  # type: ignore


def build_model():
    provider = os.getenv("STRANDS_LLM_PROVIDER", "ollama")

    if provider == "ollama":
        if OllamaModel is None:
            return None  # strands package not available
        return OllamaModel(
            host=os.getenv("STRANDS_OLLAMA_BASE_URL", "http://localhost:11434"),
            model_id=os.getenv("STRANDS_OLLAMA_MODEL", "llama3"),
        )

    if provider == "aws":
        if BedrockModel is None:
            return None  # strands package not available
        return BedrockModel(
            model_id=os.getenv("STRANDS_AWS_MODEL", "us.amazon.nova-pro-v1:0"),
            region=os.getenv("STRANDS_AWS_REGION", "us-west-2"),
        )

    if provider == "openai_compat":
        if OpenAIModel is None:
            # Provide actionable diagnostic guidance instead of silent None.
            raise RuntimeError(
                "OpenAIModel is not available. Likely causes: (1) The installed 'strands-agents' package version "
                "does not include the openai module, (2) extra dependencies for OpenAI support were not "
                "installed (try: pip install 'strands-agents[openai]' if extras are used), or (3) PYTHONPATH / venv "
                "is different from where 'strands-agents' with OpenAI support is installed. Steps to debug:\n"
                "  a) Run: python -c \"import strands_agents, pkgutil; print([m.name for m in pkgutil.walk_packages(strands_agents.__path__) if m.name.endswith('openai')])\"\n"
                "  b) Run: python -c \"import importlib; m = importlib.import_module('strands_agents.models.openai'); print(hasattr(m, 'OpenAIModel'))\"\n"
                "  c) Check version: pip show strands-agents\n"
                "  d) Reinstall with extras or upgrade: pip install -U 'strands-agents[openai]'\n"
            )
        return OpenAIModel(
            base_url=os.getenv("STRANDS_OPENAI_BASE_URL", "https://api.openai.com/v1"),
            api_key=os.getenv("STRANDS_OPENAI_API_KEY"),
            model_id=os.getenv("STRANDS_OPENAI_MODEL", "gpt-4o-mini"),
        )

    raise ValueError(f"Unsupported STRANDS_LLM_PROVIDER: {provider}")
