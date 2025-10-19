"""
CheckerAgent - Response Quality Validation

This agent validates the quality of generated responses based on configurable rules.
It checks for completeness, accuracy, and adherence to expected format.

Returns validation results with:
- is_good: boolean indicating if response passes quality checks
- score: numerical quality score (0-1)
- feedback: list of issues found or improvements needed
"""

from __future__ import annotations

import logging
from typing import Dict, List, Any, Optional
from .types import IntermediateInfo, Profile

logger = logging.getLogger(__name__)


class ValidationResult:
    """Result of response validation"""
    
    def __init__(self, is_good: bool, score: float, feedback: List[str], details: Dict[str, Any]):
        self.is_good = is_good
        self.score = score
        self.feedback = feedback
        self.details = details
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_good": self.is_good,
            "score": self.score,
            "feedback": self.feedback,
            "details": self.details
        }


class CheckerAgent:
    """
    Agent that validates response quality based on configurable rules.
    
    Default rules check for:
    - Response length (not too short)
    - Contact information presence
    - Person selection validity
    - Tacit knowledge integration
    - Proper formatting
    """
    
    def __init__(self, rules: Optional[Dict[str, Any]] = None):
        """
        Initialize CheckerAgent with validation rules
        
        Args:
            rules: Dictionary of validation rules (can be customized later)
        """
        self.rules = rules or self._default_rules()
        logger.info("CheckerAgent initialized with rules: %s", list(self.rules.keys()))
    
    def _default_rules(self) -> Dict[str, Any]:
        """Default validation rules"""
        return {
            "min_response_length": 50,  # Minimum character count
            "require_person": True,      # Must have selected person
            "require_contact": True,     # Must have contact info
            "require_department": True,  # Must have department
            "min_search_results": 1,     # Minimum search results used
            "require_tacit_knowledge": False,  # Optional tacit knowledge
            "require_mailto_link": True, # Must have mailto link
            "quality_threshold": 0.6     # Minimum score to pass (0-1)
        }
    
    def check(
        self,
        response: str,
        intermediate: IntermediateInfo,
        prompt: str = "",
        profile: Optional[Profile] = None
    ) -> ValidationResult:
        """
        Check response quality against validation rules
        
        Args:
            response: Generated response text
            intermediate: Intermediate info with selected person, search results, etc.
            prompt: Original user prompt
            profile: User profile
        
        Returns:
            ValidationResult with is_good flag, score, and feedback
        """
        feedback = []
        details = {}
        score_components = []
        
        # Rule 1: Check response length
        response_length = len(response.strip())
        min_length = self.rules.get("min_response_length", 50)
        if response_length < min_length:
            feedback.append(f"Response too short ({response_length} chars, minimum {min_length})")
            score_components.append(0.0)
        else:
            score_components.append(1.0)
        details["response_length"] = response_length
        
        # Rule 2: Check person selection
        selected_person = intermediate.selected_person
        if self.rules.get("require_person", True):
            if not selected_person or not selected_person.get("name"):
                feedback.append("No person selected or person name missing")
                score_components.append(0.0)
            else:
                score_components.append(1.0)
                details["person_name"] = selected_person.get("name")
        
        # Rule 3: Check contact information
        if self.rules.get("require_contact", True):
            contact = selected_person.get("contact", {}) if selected_person else {}
            if not contact or not contact.get("value"):
                feedback.append("Contact information missing or incomplete")
                score_components.append(0.0)
            else:
                score_components.append(1.0)
                details["contact_type"] = contact.get("type")
        
        # Rule 4: Check department
        if self.rules.get("require_department", True):
            department = selected_person.get("department", "") if selected_person else ""
            if not department:
                feedback.append("Department information missing")
                score_components.append(0.5)  # Partial score
            else:
                score_components.append(1.0)
                details["department"] = department
        
        # Rule 5: Check search results usage
        min_results = self.rules.get("min_search_results", 1)
        search_summary = intermediate.search_summary or []
        if len(search_summary) < min_results:
            feedback.append(f"Insufficient search results ({len(search_summary)}, minimum {min_results})")
            score_components.append(0.5)
        else:
            score_components.append(1.0)
        details["search_results_count"] = len(search_summary)
        
        # Rule 6: Check tacit knowledge (if required)
        if self.rules.get("require_tacit_knowledge", False):
            tacit_knowledge = intermediate.tacit_knowledge or []
            if len(tacit_knowledge) == 0:
                feedback.append("Tacit knowledge missing")
                score_components.append(0.0)
            else:
                score_components.append(1.0)
        details["tacit_knowledge_count"] = len(intermediate.tacit_knowledge or [])
        
        # Rule 7: Check mailto link presence
        if self.rules.get("require_mailto_link", True):
            if "mailto:" not in response.lower():
                feedback.append("Email link (mailto:) not found in response")
                score_components.append(0.5)
            else:
                score_components.append(1.0)
        
        # Rule 8: Check response structure (markdown sections)
        has_sections = ("##" in response or "###" in response)
        if not has_sections:
            feedback.append("Response lacks proper markdown structure")
            score_components.append(0.5)
        else:
            score_components.append(1.0)
        details["has_markdown_sections"] = has_sections
        
        # Calculate overall score
        overall_score = sum(score_components) / len(score_components) if score_components else 0.0
        quality_threshold = self.rules.get("quality_threshold", 0.6)
        is_good = overall_score >= quality_threshold and len(feedback) == 0
        
        # Add positive feedback if everything is good
        if is_good:
            feedback = ["Response meets all quality criteria"]
        elif overall_score >= quality_threshold:
            feedback.insert(0, f"Score {overall_score:.2f} meets threshold but has minor issues")
        
        details["overall_score"] = overall_score
        details["threshold"] = quality_threshold
        
        logger.info(
            "Validation result: is_good=%s, score=%.2f, issues=%d",
            is_good, overall_score, len(feedback)
        )
        
        return ValidationResult(
            is_good=is_good,
            score=overall_score,
            feedback=feedback,
            details=details
        )
    
    def update_rules(self, new_rules: Dict[str, Any]) -> None:
        """
        Update validation rules dynamically
        
        Args:
            new_rules: Dictionary of rules to update
        """
        self.rules.update(new_rules)
        logger.info("Validation rules updated: %s", list(new_rules.keys()))
    
    def get_rules(self) -> Dict[str, Any]:
        """Get current validation rules"""
        return self.rules.copy()
