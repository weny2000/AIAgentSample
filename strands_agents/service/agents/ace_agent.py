"""
ACE Agent - Agentic Context Engineering
Based on Stanford's "Fine-Tuning is Dead: This AI Learns By Itself" paper

This agent implements the ACE framework with three phases:
1. Generation: Create context from agent outputs
2. Reflection: Analyze what worked/didn't work
3. Curation: Update and optimize context strategies

The ACE agent learns from execution feedback to continuously improve
the context provided to other agents without requiring model fine-tuning.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

from .types import IntermediateInfo, Profile, SearchResult


# Data directory for storing ACE context
# Use /tmp for container environments where /app may not be writable
DATA_DIR = os.getenv("ACE_DATA_DIR", "/tmp/ace_data")
ACE_CONTEXT_PATH = os.path.join(DATA_DIR, "ace_context_store.json")


class ACEAgent:
    """
    Agentic Context Engineering Agent
    
    Implements iterative context refinement through:
    - Generation: Extract patterns from agent execution
    - Reflection: Analyze results and identify improvements
    - Curation: Build reusable context strategies
    """
    
    def __init__(self, max_context_items: int = 50):
        """
        Initialize ACE agent
        
        Args:
            max_context_items: Maximum number of context items to store
        """
        self.max_context_items = max_context_items
        self.context_store: List[Dict[str, Any]] = []
        self._load_context_store()
    
    def _load_context_store(self) -> None:
        """Load persisted context store from disk"""
        if os.path.exists(ACE_CONTEXT_PATH):
            try:
                with open(ACE_CONTEXT_PATH, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.context_store = data.get('items', [])
            except Exception:
                self.context_store = []
        else:
            self.context_store = []
    
    def _save_context_store(self) -> None:
        """Persist context store to disk"""
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(ACE_CONTEXT_PATH, 'w', encoding='utf-8') as f:
                json.dump({
                    'items': self.context_store,
                    'last_updated': datetime.now().isoformat()
                }, f, indent=2, ensure_ascii=False)
        except Exception as e:
            # Log but don't fail if persistence fails
            print(f"Warning: Failed to save ACE context store: {e}")
    
    def generate(
        self,
        query: str,
        profile: Profile,
        keywords: List[str],
        search_results: List[SearchResult],
        tacit_results: List[SearchResult],
        intermediate: IntermediateInfo
    ) -> Dict[str, Any]:
        """
        Generation Phase: Create structured context from agent execution
        
        Args:
            query: User's original query
            profile: User profile (role, skills)
            keywords: Extracted keywords
            search_results: Results from InfoFinder
            tacit_results: Results from TacitFinder
            intermediate: Intermediate results (selected person, etc.)
        
        Returns:
            Structured context dictionary
        """
        context = {
            "timestamp": datetime.now().isoformat(),
            "query": query,
            "query_length": len(query.split()),
            "profile": {
                "role": profile.get("role", "unknown"),
                "skills": profile.get("skills", "")
            },
            "keywords": {
                "count": len(keywords),
                "values": keywords
            },
            "search_coverage": {
                "info_results": len(search_results),
                "tacit_results": len(tacit_results),
                "total_results": len(search_results) + len(tacit_results)
            },
            "selected_person": {
                "name": intermediate.selected_person.get("name", ""),
                "department": intermediate.selected_person.get("department", "")
            }
        }
        return context
    
    def reflect(
        self,
        context: Dict[str, Any],
        response: str,
        execution_time_ms: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Reflection Phase: Analyze execution and extract insights
        
        Args:
            context: Context from generation phase
            response: Final response generated
            execution_time_ms: Optional execution time in milliseconds
        
        Returns:
            Insights dictionary with analysis and suggestions
        """
        insights = {
            "timestamp": datetime.now().isoformat(),
            "quality_indicators": self._assess_quality(context, response),
            "performance": {
                "execution_time_ms": execution_time_ms,
                "results_found": context.get("search_coverage", {}).get("total_results", 0)
            },
            "patterns": self._extract_patterns(context),
            "suggestions": self._generate_suggestions(context, response)
        }
        return insights
    
    def curate(self, insights: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Curation Phase: Update context store with learned strategies
        
        Args:
            insights: Insights from reflection phase
        
        Returns:
            List of delta items added to context store
        """
        delta_items = []
        quality = insights.get("quality_indicators", {})
        
        # Add successful patterns
        if quality.get("overall_score", 0) >= 0.7:
            for pattern in insights.get("patterns", []):
                delta_items.append({
                    "type": "successful_pattern",
                    "pattern": pattern,
                    "quality_score": quality.get("overall_score", 0),
                    "timestamp": datetime.now().isoformat()
                })
        
        # Add improvement strategies
        for suggestion in insights.get("suggestions", []):
            delta_items.append({
                "type": "improvement_strategy",
                "strategy": suggestion,
                "timestamp": datetime.now().isoformat()
            })
        
        # Add to context store
        self.context_store.extend(delta_items)
        
        # Prune old items if exceeding max
        if len(self.context_store) > self.max_context_items:
            self.context_store = self.context_store[-self.max_context_items:]
        
        # Persist to disk
        self._save_context_store()
        
        return delta_items
    
    def get_context_instructions(self, query: str = "", profile: Profile = None) -> str:
        """
        Get accumulated context engineering instructions for agent execution
        
        Args:
            query: Current query (for context-specific instructions)
            profile: User profile (for role-specific instructions)
        
        Returns:
            Formatted context instructions string
        """
        if not self.context_store:
            return ""
        
        instructions = ["# ACE Context Engineering Instructions"]
        
        # Get recent successful patterns (last 10)
        patterns = [
            item for item in self.context_store[-20:]
            if item.get("type") == "successful_pattern"
        ][-10:]
        
        if patterns:
            instructions.append("\n## Successful Patterns to Apply:")
            for item in patterns:
                pattern = item.get("pattern", {})
                score = item.get("quality_score", 0)
                instructions.append(f"- [{score:.2f}] {pattern.get('description', 'N/A')}")
        
        # Get recent improvement strategies (last 5)
        strategies = [
            item for item in self.context_store[-15:]
            if item.get("type") == "improvement_strategy"
        ][-5:]
        
        if strategies:
            instructions.append("\n## Improvement Strategies:")
            for item in strategies:
                instructions.append(f"- {item.get('strategy', 'N/A')}")
        
        return "\n".join(instructions)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get ACE agent statistics"""
        patterns = [item for item in self.context_store if item.get("type") == "successful_pattern"]
        strategies = [item for item in self.context_store if item.get("type") == "improvement_strategy"]
        
        return {
            "total_items": len(self.context_store),
            "successful_patterns": len(patterns),
            "improvement_strategies": len(strategies),
            "avg_quality_score": sum(p.get("quality_score", 0) for p in patterns) / max(len(patterns), 1),
            "oldest_item": self.context_store[0].get("timestamp") if self.context_store else None,
            "newest_item": self.context_store[-1].get("timestamp") if self.context_store else None
        }
    
    # ========== Private Helper Methods ==========
    
    def _assess_quality(self, context: Dict[str, Any], response: str) -> Dict[str, Any]:
        """Assess quality of execution"""
        # Simple heuristic-based quality assessment
        quality = {
            "response_length": len(response),
            "response_has_person": "氏名:" in response or "name:" in response.lower(),
            "response_has_contact": "連絡先:" in response or "contact:" in response.lower(),
            "response_has_tacit": "暗黙知" in response or "tacit" in response.lower(),
            "keywords_used": context.get("keywords", {}).get("count", 0) > 0,
            "results_found": context.get("search_coverage", {}).get("total_results", 0) > 0
        }
        
        # Calculate overall score (0-1)
        score = sum([
            0.2 if quality["response_length"] > 100 else 0,
            0.2 if quality["response_has_person"] else 0,
            0.2 if quality["response_has_contact"] else 0,
            0.15 if quality["response_has_tacit"] else 0,
            0.15 if quality["keywords_used"] else 0,
            0.1 if quality["results_found"] else 0
        ])
        
        quality["overall_score"] = score
        return quality
    
    def _extract_patterns(self, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract reusable patterns from successful execution"""
        patterns = []
        
        # Pattern: Query type identification
        query_length = context.get("query_length", 0)
        if query_length > 10:
            patterns.append({
                "name": "long_query_handling",
                "description": "Use semantic search for detailed queries",
                "condition": "query_length > 10"
            })
        
        # Pattern: Role-based context
        role = context.get("profile", {}).get("role", "")
        if role:
            patterns.append({
                "name": "role_based_context",
                "description": f"Tailor response for role: {role}",
                "condition": f"profile.role == '{role}'"
            })
        
        # Pattern: Keyword coverage
        kw_count = context.get("keywords", {}).get("count", 0)
        if kw_count >= 5:
            patterns.append({
                "name": "comprehensive_keywords",
                "description": "Rich keyword extraction enables better search",
                "condition": "keywords_count >= 5"
            })
        
        return patterns
    
    def _generate_suggestions(self, context: Dict[str, Any], response: str) -> List[str]:
        """Generate improvement suggestions based on analysis"""
        suggestions = []
        
        # Analyze keyword coverage
        kw_count = context.get("keywords", {}).get("count", 0)
        if kw_count < 3:
            suggestions.append("Improve keyword extraction - consider using more diverse extraction strategies")
        
        # Analyze search results
        total_results = context.get("search_coverage", {}).get("total_results", 0)
        if total_results < 3:
            suggestions.append("Expand search coverage - consider broadening search criteria or using synonyms")
        
        # Analyze tacit knowledge usage
        tacit_count = context.get("search_coverage", {}).get("tacit_results", 0)
        if tacit_count == 0:
            suggestions.append("Integrate tacit knowledge - ensure tacit knowledge is being searched and utilized")
        
        # Response completeness
        if len(response) < 100:
            suggestions.append("Enhance response detail - provide more comprehensive information")
        
        return suggestions
    
    def optimize(
        self,
        context: Dict[str, Any],
        validation_feedback: List[str],
        intermediate: IntermediateInfo,
        loop_count: int
    ) -> Dict[str, Any]:
        """
        Optimize context based on validation feedback for retry
        
        This method analyzes why the response failed validation and generates
        specific optimization instructions for the next iteration.
        
        Args:
            context: Current execution context from generate()
            validation_feedback: Feedback from CheckerAgent
            intermediate: Current intermediate results
            loop_count: Current retry iteration number
        
        Returns:
            Optimization instructions dictionary with:
            - keywords_optimization: instructions for keyword extraction
            - search_optimization: instructions for search improvement
            - response_optimization: instructions for response building
            - focus_areas: list of areas to emphasize
        """
        optimization = {
            "timestamp": datetime.now().isoformat(),
            "loop_count": loop_count,
            "keywords_optimization": "",
            "search_optimization": "",
            "response_optimization": "",
            "focus_areas": []
        }
        
        # Analyze validation feedback to determine optimization strategy
        feedback_text = " ".join(validation_feedback).lower()
        
        # Optimize keywords if response is too short or lacks content
        if "too short" in feedback_text or "insufficient" in feedback_text:
            optimization["keywords_optimization"] = (
                "Expand keyword extraction to capture more semantic variations and related terms. "
                "Consider synonyms, related concepts, and domain-specific terminology."
            )
            optimization["focus_areas"].append("keyword_expansion")
        
        # Optimize search if results are insufficient
        if "search results" in feedback_text or "insufficient" in feedback_text:
            optimization["search_optimization"] = (
                "Broaden search criteria: "
                "1) Use more diverse keyword combinations "
                "2) Reduce specificity to capture more results "
                "3) Include partial matches and fuzzy search"
            )
            optimization["focus_areas"].append("search_coverage")
        
        # Optimize person selection if contact/department missing
        if "person" in feedback_text or "contact" in feedback_text or "department" in feedback_text:
            optimization["search_optimization"] = (
                "Prioritize results with complete person information: "
                "1) Filter for entries with contact details "
                "2) Prefer results with department information "
                "3) Look for entries with multiple contact methods"
            )
            optimization["focus_areas"].append("person_selection")
        
        # Optimize response building if structure or content issues
        if "structure" in feedback_text or "markdown" in feedback_text or "mailto" in feedback_text:
            optimization["response_optimization"] = (
                "Enhance response formatting and completeness: "
                "1) Ensure proper markdown section headers "
                "2) Include all required sections (contact, summary, tacit knowledge) "
                "3) Add mailto link with properly formatted subject and body "
                "4) Provide more detailed explanations in each section"
            )
            optimization["focus_areas"].append("response_formatting")
        
        # Optimize tacit knowledge integration
        if "tacit" in feedback_text:
            optimization["search_optimization"] = (
                "Enhance tacit knowledge integration: "
                "1) Ensure tacit knowledge search is executed "
                "2) Incorporate tacit knowledge findings into response "
                "3) Highlight unique insights from tacit knowledge"
            )
            optimization["focus_areas"].append("tacit_knowledge")
        
        # Add general improvement for each iteration
        if loop_count == 1:
            optimization["response_optimization"] += (
                " First retry: Focus on completing all required fields and sections."
            )
        elif loop_count == 2:
            optimization["response_optimization"] += (
                " Second retry: Emphasize quality and detail in all sections."
            )
        elif loop_count >= 3:
            optimization["response_optimization"] += (
                " Final retry: Maximize all quality indicators and ensure comprehensive coverage."
            )
        
        # Store optimization in context store for learning
        self.context_store.append({
            "type": "optimization_attempt",
            "loop_count": loop_count,
            "feedback": validation_feedback,
            "focus_areas": optimization["focus_areas"],
            "timestamp": datetime.now().isoformat()
        })
        self._save_context_store()
        
        return optimization
