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

    def _truncate_to_words(self, text: str, max_words: int = 300) -> str:
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

    def _build_mailto_link(self, summary_text: str, subject: str = "ご質問のお願い", to_email: str | None = None) -> str:
        encoded_subject = quote(subject)
        encoded_body = quote(summary_text)
        recipient = to_email.strip() if isinstance(to_email, str) and to_email.strip() else ""
        mailto_prefix = f"mailto:{recipient}" if recipient else "mailto:"
        return f"[Contact now]({mailto_prefix}?subject={encoded_subject}&body={encoded_body})"

    def _build_contextual_preface(self, original_prompt: str | None, context_info: Dict[str, Any] | None) -> str:
        """Construct a concise plain-text contextual block for email body summarization."""
        sections: List[str] = []
        try:
            if original_prompt and original_prompt.strip():
                sections.append("【ユーザー質問】\n" + original_prompt.strip())
            if context_info:
                sp = context_info.get("selected_person")
                if isinstance(sp, dict):
                    name = sp.get("name")
                    dept = sp.get("department")
                    if name or dept:
                        lines = []
                        if name:
                            lines.append(f"- 氏名: {name}")
                        if dept:
                            lines.append(f"- 所属: {dept}")
                        sections.append("【対象人物】\n" + "\n".join(lines))
                search_items = context_info.get("search_summary") or []
                if isinstance(search_items, list) and search_items:
                    top_items = search_items[:2]
                    lines = [f"- {it.get('title','')}: {it.get('snippet','')}" for it in top_items]
                    sections.append("【参考情報(上位2件)】\n" + "\n".join(lines))
                tacit_items = context_info.get("tacit_knowledge") or []
                if isinstance(tacit_items, list) and tacit_items:
                    top_tacit = tacit_items[:2]
                    lines = [f"- {it.get('title','')}: {it.get('snippet','')}" for it in top_tacit]
                    sections.append("【暗黙知(上位2件)】\n" + "\n".join(lines))
        except Exception:
            # Fail silently; return what we have
            pass
        return "\n\n".join([s for s in sections if s])

    def _append_email_summary_link(self, content: str, subject: str, to_email: str | None = None, target_languages: List[str] | None = None, original_prompt: str | None = None, context_info: Dict[str, Any] | None = None) -> str:
        """
        Summarize content to ~300 words via LLM (plain text) and append a mailto link.
        Falls back to simple truncation if LLM is unavailable or fails.
        """
        summary: str | None = None
        contextual_preface = self._build_contextual_preface(original_prompt, context_info)

        # Combine contextual preface with original content for summarization input.
        content_for_summary = contextual_preface + ("\n\n" if contextual_preface and content else "") + content
        try:
            model = build_model()
            if (Agent is not None) and (model is not None):
                agent = Agent(model=model)
                sys = (
                    "You are an assistant that drafts concise plain-text email messages intended to ask the selected person questions.\n"
                    "Requirements:\n"
                    "- Write a short email body in plain text only.\n"
                    "- Keep it within 300 words.\n"
                    "- Begin with a brief greeting addressing the selected person by name if available.\n"
                    "- Clearly state the context based on the provided content.\n"
                    "- Ask 2-3 specific questions the recipient can answer.\n"
                    "- No markdown, no emojis, no URLs, no special formatting.\n"
                    "- Preserve the original input language and tone (e.g., Japanese business etiquette if the input is Japanese)."
                )
                user = (
                    "Draft a plain-text email to the selected person that asks the necessary questions using the following context."
                    " The context includes the user question, selected person info, and top knowledge items if available.\n\n"
                    f"{content_for_summary}"
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

            # Post-process summary: ensure plain text and <= 300 words
            if summary:
                summary = self._truncate_to_words(summary, 300).strip()
        except Exception as e:
            logging.getLogger(__name__).warning("Email summary LLM call failed: %s", e)
            summary = None

        if not summary:
            summary = self._truncate_to_words(content_for_summary, 300)

        # Translate summary (email body) to recipient's language if provided
        try:
            if target_languages:
                target_language = None
                for lang in target_languages:
                    if isinstance(lang, str) and lang.strip():
                        target_language = lang.strip()
                        break
                if target_language:
                    translated_summary = self._translate_to_language(summary, target_language)
                    if isinstance(translated_summary, str) and translated_summary.strip():
                        summary = translated_summary.strip()
        except Exception as e:
            logging.getLogger(__name__).warning("Email body translation failed: %s", e)

        # Build final mailto link (still using original content for display; summary for body)
        link = self._build_mailto_link(summary, subject, to_email)
        return f"{content}\n\n{link}"

    async def _translate_to_prompt_language(self, text: str, prompt_text: str) -> str:
        """
        Use LLM to translate 'text' into the same language as 'prompt_text'.
        If translation fails or LLM unavailable, return original text.
        """
        try:
            model = build_model()
            if (Agent is not None) and (model is not None):
                agent = Agent(model=model)
                sys = (
                    "You are a professional translator.\n"
                    "Task: Translate the provided content to the language of the provided user prompt.\n"
                    "Requirements:\n"
                    "- Detect the language of the user prompt.\n"
                    "- Translate the content to exactly that language.\n"
                    "- Preserve markdown formatting and technical terms.\n"
                    "- Keep names, code, and symbols unchanged as appropriate.\n"
                    "- Do not add explanations or notes.\n"
                    "- Output only the translated content.\n"
                    "- If the content is already in the same language, return it unchanged."
                )
                user = (
                    "User prompt (for language detection):\n"
                    f"{prompt_text}\n\n"
                    "Content to translate:\n"
                    f"{text}"
                )
                prompt = f"{sys}\n{user}"
                result = agent(prompt)
                if asyncio.iscoroutine(result):
                    resp = await result
                else:
                    resp = result

                if hasattr(resp, "message"):
                    message = getattr(resp, "message", "")
                    if isinstance(message, dict):
                        return self._parse_json_response(message).strip()
                    elif isinstance(message, str):
                        try:
                            json_data = json.loads(message)
                            return self._parse_json_response(json_data).strip()
                        except json.JSONDecodeError:
                            return str(message).strip()
                elif isinstance(resp, dict):
                    return self._parse_json_response(resp).strip()
                elif isinstance(resp, str):
                    try:
                        json_data = json.loads(resp)
                        return self._parse_json_response(json_data).strip()
                    except json.JSONDecodeError:
                        return str(resp).strip()
                else:
                    return str(resp).strip()
        except Exception as e:
            logging.getLogger(__name__).warning("LLM translation failed: %s", e)
        return text

    def _translate_to_language(self, text: str, target_language: str) -> str:
        """
        Translate text to the specified target language using LLM.
        Returns original text on failure or if LLM unavailable.
        """
        try:
            model = build_model()
            if (Agent is not None) and (model is not None):
                agent = Agent(model=model)
                sys = (
                    "You are a professional translator.\n"
                    "Task: Translate the provided content to the specified target language.\n"
                    "Requirements:\n"
                    "- Translate the content to exactly the target language.\n"
                    "- Preserve markdown formatting and technical terms.\n"
                    "- Keep names, code, and symbols unchanged as appropriate.\n"
                    "- Do not add explanations or notes.\n"
                    "- Output only the translated content.\n"
                    "- If the content is already in the target language, return it unchanged."
                )
                user = (
                    f"Target language: {target_language}\n\n"
                    "Content to translate:\n"
                    f"{text}"
                )
                prompt = f"{sys}\n{user}"
                result = agent(prompt)

                if asyncio.iscoroutine(result):
                    # Handle coroutine by running in a new event loop if possible
                    try:
                        loop = asyncio.get_event_loop()
                        if loop and loop.is_running():
                            # Cannot await here in a sync function; return original
                            return text
                        else:
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
                    except Exception as e:
                        logging.getLogger(__name__).warning("Translator coroutine execution failed: %s", e)
                        return text
                else:
                    resp = result

                # Parse response similar to other LLM calls
                if hasattr(resp, "message"):
                    message = getattr(resp, "message", "")
                    if isinstance(message, dict):
                        return self._parse_json_response(message).strip()
                    elif isinstance(message, str):
                        try:
                            json_data = json.loads(message)
                            return self._parse_json_response(json_data).strip()
                        except json.JSONDecodeError:
                            return str(message).strip()
                elif isinstance(resp, dict):
                    return self._parse_json_response(resp).strip()
                elif isinstance(resp, str):
                    try:
                        json_data = json.loads(resp)
                        return self._parse_json_response(json_data).strip()
                    except json.JSONDecodeError:
                        return str(resp).strip()
                else:
                    return str(resp).strip()
        except Exception as e:
            logging.getLogger(__name__).warning("LLM target-language translation failed: %s", e)
        return text

    async def _finalize_response(self, content: str, subject: str, to_email: str | None, prompt: str | None, target_languages: List[str] | None = None, info: IntermediateInfo | None = None) -> str:
        """
        Translate content and subject to match prompt language (if provided),
        then append email summary link.
        """
        translated_content = content
        translated_subject = subject
        try:
            if prompt:
                translated_content = await self._translate_to_prompt_language(content, prompt)
                translated_subject = await self._translate_to_prompt_language(subject, prompt)
        except Exception as e:
            logging.getLogger(__name__).warning("Finalize response translation failed: %s", e)

        context_info: Dict[str, Any] | None = None
        try:
            if info:
                context_info = {
                    "selected_person": info.selected_person,
                    "search_summary": info.search_summary,
                    "tacit_knowledge": info.tacit_knowledge,
                }
        except Exception:
            context_info = None
        return self._append_email_summary_link(translated_content, translated_subject, to_email, target_languages, original_prompt=prompt, context_info=context_info)

    async def build_response(self, info: IntermediateInfo, profile: Profile, prompt: str | None = None) -> str:
        if Agent is not None:
            model = build_model()
            if model is not None:
                agent = Agent(model=model)
                sys = (
                    "You are a helpful assistant. Tailor the answer to the user's role and skills. "
                    "Summarize briefly and include sections::"
                    "'Recommended contact' section with the selected person, their department, and preferred contact."
                    "'Tacit knowledge' section summarizing tacit knowledge results."
                    "Respond strictly in the same language as the provided user prompt and preserve its tone and register."
                )
                tacit_lines = [f"- {tk.get('title','')}: {tk.get('snippet','')}" for tk in (info.tacit_knowledge or [])]
                tacit_text = "\n".join(tacit_lines) if tacit_lines else "N/A"
                summary_lines = [f"- {s.get('title','')}: {s.get('snippet','')}" for s in (info.search_summary or [])]
                summary_text = "\n".join(summary_lines) if summary_lines else "N/A"

                user = (
                    f"User prompt (language context):\n{prompt or ''}\n"
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
                    # Determine recipient email and languages from selected_person if available
                    recipient_email = None
                    recipient_languages = None
                    try:
                        sp = info.selected_person or {}
                        contact = sp.get('contact') if isinstance(sp, dict) else None
                        if isinstance(contact, dict):
                            ctype = str(contact.get('type', '')).lower()
                            if ctype in ('email', 'mail'):
                                recipient_email = contact.get('value')
                        if not recipient_email and isinstance(sp, dict):
                            recipient_email = sp.get('email') or sp.get('mail')
                        if isinstance(sp, dict):
                            recipient_languages = sp.get('languages')
                    except Exception:
                        recipient_email = None
                        recipient_languages = None
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
                            return await self._finalize_response(parsed, subject, recipient_email, prompt, recipient_languages, info)
                        elif isinstance(message, str):
                            # Try to parse as JSON first
                            try:
                                json_data = json.loads(message)
                                parsed = self._parse_json_response(json_data)
                                return await self._finalize_response(parsed, subject, recipient_email, prompt, recipient_languages, info)
                            except json.JSONDecodeError:
                                # If not JSON, return as is
                                text = str(message).strip()
                                if text:
                                    return await self._finalize_response(text, subject, recipient_email, prompt, recipient_languages, info)
                    elif isinstance(resp, dict):
                        # If resp itself is a dict (JSON response), parse it
                        parsed = self._parse_json_response(resp)
                        return await self._finalize_response(parsed, subject, recipient_email, prompt, recipient_languages, info)
                    elif isinstance(resp, str):
                        # Try to parse as JSON first
                        try:
                            json_data = json.loads(resp)
                            parsed = self._parse_json_response(json_data)
                            return await self._finalize_response(parsed, subject, recipient_email, prompt, recipient_languages, info)
                        except json.JSONDecodeError:
                            # If not JSON, return as is
                            text = str(resp).strip()
                            if text:
                                return await self._finalize_response(text, subject, recipient_email, prompt, recipient_languages, info)
                    else:
                        text = str(resp).strip()
                        if text:
                            return await self._finalize_response(text, subject, recipient_email, prompt, recipient_languages, info)
                except Exception as e:
                    logging.getLogger(__name__).warning("LLM response generation failed: %s", e)

        person = info.selected_person
        subject = self._build_email_subject(profile, info)
        # Determine recipient email from selected_person if available (fallback path)
        recipient_email = None
        recipient_languages = None
        try:
            contact = person.get('contact') if isinstance(person, dict) else None
            if isinstance(contact, dict):
                ctype = str(contact.get('type', '')).lower()
                if ctype in ('email', 'mail'):
                    recipient_email = contact.get('value')
            if not recipient_email and isinstance(person, dict):
                recipient_email = person.get('email') or person.get('mail')
            if isinstance(person, dict):
                recipient_languages = person.get('languages')
        except Exception:
            recipient_email = None
            recipient_languages = None
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
        return await self._finalize_response(content, subject, recipient_email, prompt, recipient_languages, info)
