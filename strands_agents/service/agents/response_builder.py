from __future__ import annotations

import asyncio
import logging
import json
from typing import Dict, Any, List
from urllib.parse import quote

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

    def _truncate_to_words(self, text: str, max_words: int = 200) -> str:
        try:
            words = text.split()
            if len(words) <= max_words:
                return text.strip()
            return " ".join(words[:max_words]).strip()
        except Exception:
            return text.strip()

    def _build_email_subject(self, profile: Profile, info: IntermediateInfo) -> str:
        try:
            role = profile.get('role') or "ユーザー"
            person_name = None
            try:
                person_name = info.selected_person.get('name') if info.selected_person else None
            except Exception:
                person_name = None
            if person_name:
                subject = f"{person_name}様へのご質問（{role}より）"
            else:
                subject = f"ご質問のお願い（{role}より）"
            return subject
        except Exception:
            return "ご質問のお願い"

    def _build_mailto_link(self, summary_text: str, subject: str = "ご質問のお願い") -> str:
        encoded_subject = quote(subject)
        encoded_body = quote(summary_text)
        return f"[メールで質問を送る](mailto:?subject={encoded_subject}&body={encoded_body})"

    def _append_email_summary_link(self, content: str, subject: str) -> str:
        """
        Summarize content to ~200 words via LLM (plain text) and append a mailto link.
        Falls back to simple truncation if LLM is unavailable or fails.
        """
        summary: str | None = None
        try:
            model = build_model()
            if (Agent is not None) and (model is not None):
                agent = Agent(model=model)
                sys = (
                    "You are an assistant that drafts concise plain-text email messages intended to ask the selected person questions.\n"
                    "Requirements:\n"
                    "- Write a short email body in plain text only.\n"
                    "- Keep it within 200 words.\n"
                    "- Begin with a brief greeting addressing the selected person by name if available.\n"
                    "- Clearly state the context based on the provided content.\n"
                    "- Ask 2-3 specific questions the recipient can answer.\n"
                    "- No markdown, no emojis, no URLs, no special formatting.\n"
                    "- Preserve the original input language and tone (e.g., Japanese business etiquette if the input is Japanese)."
                )
                user = (
                    "Draft a plain-text email to the selected person that asks the necessary questions using the following context:\n\n"
                    f"{content}"
                )
                prompt = f"{sys}\n{user}"
                result = agent(prompt)

                if asyncio.iscoroutine(result):
                    # Only run the coroutine if there's no active event loop; otherwise, fallback.
                    try:
                        loop = asyncio.get_event_loop()
                        if loop and loop.is_running():
                            # Cannot await here in a sync function; leave summary as None for fallback.
                            pass
                        else:
                            # Run coroutine in a new event loop
                            new_loop = asyncio.new_event_loop()
                            try:
                                asyncio.set_event_loop(new_loop)
                                resp = new_loop.run_until_complete(result)
                            finally:
                                try:
                                    new_loop.close()
                                except Exception:
                                    pass
                                asyncio.set_event_loop(None)

                            # Parse response similar to build_response
                            if hasattr(resp, "message"):
                                message = getattr(resp, "message", "")
                                if isinstance(message, dict):
                                    summary = self._parse_json_response(message)
                                elif isinstance(message, str):
                                    try:
                                        json_data = json.loads(message)
                                        summary = self._parse_json_response(json_data)
                                    except json.JSONDecodeError:
                                        summary = str(message).strip()
                            elif isinstance(resp, dict):
                                summary = self._parse_json_response(resp)
                            elif isinstance(resp, str):
                                try:
                                    json_data = json.loads(resp)
                                    summary = self._parse_json_response(json_data)
                                except json.JSONDecodeError:
                                    summary = str(resp).strip()
                            else:
                                summary = str(resp).strip()
                    except Exception as e:
                        logging.getLogger(__name__).warning("LLM summary generation failed: %s", e)
                        summary = None
                else:
                    # Synchronous result
                    resp = result
                    if hasattr(resp, "message"):
                        message = getattr(resp, "message", "")
                        if isinstance(message, dict):
                            summary = self._parse_json_response(message)
                        elif isinstance(message, str):
                            try:
                                json_data = json.loads(message)
                                summary = self._parse_json_response(json_data)
                            except json.JSONDecodeError:
                                summary = str(message).strip()
                    elif isinstance(resp, dict):
                        summary = self._parse_json_response(resp)
                    elif isinstance(resp, str):
                        try:
                            json_data = json.loads(resp)
                            summary = self._parse_json_response(json_data)
                        except json.JSONDecodeError:
                            summary = str(resp).strip()
                    else:
                        summary = str(resp).strip()

            # Post-process summary: ensure plain text and <= 200 words
            if summary:
                summary = self._truncate_to_words(summary, 200).strip()
        except Exception as e:
            logging.getLogger(__name__).warning("Email summary LLM call failed: %s", e)
            summary = None

        if not summary:
            summary = self._truncate_to_words(content, 200)

        link = self._build_mailto_link(summary, subject)
        return f"{content}\n\n{link}"

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
                    subject = self._build_email_subject(profile, info)
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
                            parsed = self._parse_json_response(message)
                            return self._append_email_summary_link(parsed, subject)
                        elif isinstance(message, str):
                            # Try to parse as JSON first
                            try:
                                json_data = json.loads(message)
                                parsed = self._parse_json_response(json_data)
                                return self._append_email_summary_link(parsed, subject)
                            except json.JSONDecodeError:
                                # If not JSON, return as is
                                text = str(message).strip()
                                if text:
                                    return self._append_email_summary_link(text, subject)
                    elif isinstance(resp, dict):
                        # If resp itself is a dict (JSON response), parse it
                        parsed = self._parse_json_response(resp)
                        return self._append_email_summary_link(parsed, subject)
                    elif isinstance(resp, str):
                        # Try to parse as JSON first
                        try:
                            json_data = json.loads(resp)
                            parsed = self._parse_json_response(json_data)
                            return self._append_email_summary_link(parsed, subject)
                        except json.JSONDecodeError:
                            # If not JSON, return as is
                            text = str(resp).strip()
                            if text:
                                return self._append_email_summary_link(text, subject)
                    else:
                        text = str(resp).strip()
                        if text:
                            return self._append_email_summary_link(text, subject)
                except Exception as e:
                    logging.getLogger(__name__).warning("LLM response generation failed: %s", e)

        person = info.selected_person
        subject = self._build_email_subject(profile, info)
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
        content = "\n".join(parts)
        return self._append_email_summary_link(content, subject)
