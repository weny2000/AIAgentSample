from __future__ import annotations

import asyncio
import logging
import json
from typing import Dict, Any, List

from .types import IntermediateInfo, Profile
from .model_provider import build_model

try:
    from strands_agents import Agent  # type: ignore
except Exception:
    try:
        from strands import Agent  # type: ignore  # legacy fallback
    except Exception:
        Agent = None  # type: ignore


class ResponseBuilder:
    def _parse_json_response(self, json_response: Dict[str, Any]) -> str:
        """Parse JSON response format and extract text content"""
        try:
            if 'content' in json_response and isinstance(json_response['content'], list):
                # Extract text from content array
                content_parts = []
                for item in json_response['content']:
                    if isinstance(item, dict) and 'text' in item:
                        content_parts.append(item['text'])
                return '\n'.join(content_parts)
            elif isinstance(json_response, dict) and 'content' in json_response:
                # Handle case where content is a string
                return str(json_response['content'])
            else:
                # Fallback: return the entire response as string
                return str(json_response)
        except Exception as e:
            logging.getLogger(__name__).warning("Failed to parse JSON response: %s", e)
            return str(json_response)

    async def build_response(self, info: IntermediateInfo, profile: Profile) -> str:
        if Agent is not None:
            model = build_model()
            if model is not None:
                agent = Agent(model=model)
                sys = (
                    "You are a helpful assistant. Tailor the answer to the user's role and skills. "
                    "Summarize briefly and include sections::"
                    "'Recommended contact' section with the selected person, their department, and preferred contact."
                    "'Tacit knowledge' section summarizing tacit knowledge results."
                )
                tacit_lines = [f"- {tk.get('title','')}: {tk.get('snippet','')}" for tk in (info.tacit_knowledge or [])]
                tacit_text = "\n".join(tacit_lines) if tacit_lines else "N/A"
                summary_lines = [f"- {s.get('title','')}: {s.get('snippet','')}" for s in (info.search_summary or [])]
                summary_text = "\n".join(summary_lines) if summary_lines else "N/A"

                user = (
                    f"Role: {profile.get('role')}\n"
                    f"Skills: {profile.get('skills')}\n"
                    f"Selected person: {info.selected_person}\n"
                    f"Search summary:\n{summary_text}\n"
                    f"Tacit knowledge:\n{tacit_text}\n"
                    "Provide a concise markdown answer."
                )
                try:
                    prompt_text = f"{sys}\n{user}"
                    result = agent(prompt_text)
                    if asyncio.iscoroutine(result):
                        resp = await result
                    else:
                        resp = result
                    
                    # Handle different response types
                    if hasattr(resp, "message"):
                        message = getattr(resp, "message", "")
                        if isinstance(message, dict):
                            # If message is a dict (JSON response), parse it
                            return self._parse_json_response(message)
                        elif isinstance(message, str):
                            # Try to parse as JSON first
                            try:
                                json_data = json.loads(message)
                                return self._parse_json_response(json_data)
                            except json.JSONDecodeError:
                                # If not JSON, return as is
                                text = str(message).strip()
                                if text:
                                    return text
                    elif isinstance(resp, dict):
                        # If resp itself is a dict (JSON response), parse it
                        return self._parse_json_response(resp)
                    elif isinstance(resp, str):
                        # Try to parse as JSON first
                        try:
                            json_data = json.loads(resp)
                            return self._parse_json_response(json_data)
                        except json.JSONDecodeError:
                            # If not JSON, return as is
                            text = str(resp).strip()
                            if text:
                                return text
                    else:
                        text = str(resp).strip()
                        if text:
                            return text
                except Exception as e:
                    logging.getLogger(__name__).warning("LLM response generation failed: %s", e)

        person = info.selected_person
        parts = [
            f"## 回答（{profile.get('role') or 'ユーザー'}向け）",
            "- 入力内容に基づき、社内情報を要約しました。",
            "",
            "### 推奨コンタクト",
            f"- 氏名: {person['name']}",
            f"- 所属: {person['department']}",
            f"- 連絡先: {person['contact']['type']}: {person['contact']['value']}",
            "",
            "### 参考情報",
        ]
        for item in info.search_summary:
            parts.append(f"- {item.get('title','')}: {item.get('snippet','')}")
        # Tacit knowledge section
        if info.tacit_knowledge:
            parts.append("")
            parts.append("### 暗黙知")
            for tk in info.tacit_knowledge:
                parts.append(f"- {tk.get('title','')}: {tk.get('snippet','')}")
        return "\n".join(parts)
