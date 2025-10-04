import json
import logging
import asyncio
from typing import Optional

from .types import Profile, KeywordsResult
from .model_provider import build_model

try:
    from strands_agents import Agent  # type: ignore
except Exception:
    try:
        from strands import Agent  # type: ignore  # legacy fallback
    except Exception:
        Agent = None  # type: ignore

logger = logging.getLogger(__name__)

class InfoCollector:
    async def extract_keywords(self, prompt: str, profile: Profile) -> KeywordsResult:
        keywords = await self._extract_with_llm(prompt, profile)
        if not keywords:
            tokens = [w.strip(",.?!") for w in prompt.split()]
            keywords = [w for w in tokens if len(w) > 3][:6]
        return KeywordsResult(keywords=list(dict.fromkeys(keywords)))

    async def _extract_with_llm(self, prompt: str, profile: Profile) -> Optional[list[str]]:
        if Agent is None:
            return None
        model = build_model()
        if model is None:
            return None
        agent = Agent(model=model)
        sys = "Extract 3-8 concise search keywords from the user's question. Output ONLY a JSON array of strings without any explanation and pre/sufix like '```json'."
        user = f"User role: {profile.get('role')}\nSkills: {profile.get('skills')}\nQuestion: {prompt}"
        try:
            prompt_text = f"{sys}\n{user}"
            result = agent(prompt_text)
            if asyncio.iscoroutine(result):
                resp = await result
            else:
                resp = result
        except Exception as e:
            # Provider/connection error (e.g., Ollama not running, API key missing, etc.)
            logger.warning("LLM keyword extraction failed: %s", e)
            return None
        # Normalize response to text
        if isinstance(resp, str):
            text = resp.strip()
        elif isinstance(resp, dict):
            text = str(resp.get("message") or resp.get("content") or resp.get("text") or resp).strip()
        else:
            text = str(getattr(resp, "message", getattr(resp, "content", getattr(resp, "text", resp)))).strip()
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [str(x).strip() for x in data if str(x).strip()]
        except Exception as e:
            logger.debug("Failed to parse LLM JSON output: %r (%s)", text[:200], e)
            return None
        return None
