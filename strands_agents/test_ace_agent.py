"""
Test script for ACE Agent integration

This script demonstrates the ACE agent's learning capabilities
by running multiple queries and showing how it improves over time.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from strands_agents.service.agents.ace_agent import ACEAgent
from strands_agents.service.agents.types import IntermediateInfo


async def test_ace_agent():
    """Test ACE agent generation, reflection, and curation"""
    
    print("="*60)
    print("ACE Agent Test - Agentic Context Engineering")
    print("="*60)
    
    # Initialize ACE agent
    ace = ACEAgent()
    
    # Simulated agent execution data
    test_cases = [
        {
            "query": "How to deploy our microservice to AWS EKS?",
            "profile": {"role": "DevOps", "skills": "AWS, Kubernetes, Docker"},
            "keywords": ["deploy", "microservice", "AWS", "EKS", "kubernetes"],
            "search_results": [
                {"title": "EKS Deployment Guide", "snippet": "Step by step...", "authors": ["John"], "department": "DevOps", "tags": ["aws", "eks"]},
                {"title": "Docker Best Practices", "snippet": "Container tips...", "authors": ["Jane"], "department": "Engineering", "tags": ["docker"]},
            ],
            "tacit_results": [
                {"title": "Internal EKS Setup", "snippet": "Our internal config...", "authors": ["Mike"], "department": "DevOps", "tags": ["internal"]},
            ],
            "response": """### Recommended Contact
- Name: John Smith
- Department: DevOps
- Contact: email: john@company.com

### Reference Information
- EKS Deployment Guide: Step by step deployment process

### Tacit Knowledge
- Internal EKS Setup: Our internal configuration and best practices"""
        },
        {
            "query": "What's the onboarding process?",
            "profile": {"role": "HR", "skills": "People Management"},
            "keywords": ["onboarding", "process", "new", "hire"],
            "search_results": [
                {"title": "Onboarding Checklist", "snippet": "Day 1 tasks...", "authors": ["Sarah"], "department": "HR", "tags": ["onboarding"]},
            ],
            "tacit_results": [],
            "response": """### Recommended Contact
- Name: Sarah Johnson
- Department: HR
- Contact: slack: @sarah.johnson

### Reference Information
- Onboarding Checklist: Complete list of day 1 tasks"""
        },
        {
            "query": "How do we handle customer escalations?",
            "profile": {"role": "Support Manager", "skills": "Customer Service"},
            "keywords": ["customer", "escalation", "support", "handle"],
            "search_results": [
                {"title": "Escalation Process", "snippet": "SLA guidelines...", "authors": ["Tom"], "department": "Support", "tags": ["process"]},
                {"title": "Customer Communication", "snippet": "Best practices...", "authors": ["Lisa"], "department": "Support", "tags": ["communication"]},
            ],
            "tacit_results": [
                {"title": "Escalation Examples", "snippet": "Real cases...", "authors": ["Tom"], "department": "Support", "tags": ["examples"]},
            ],
            "response": """### Recommended Contact
- Name: Tom Brown
- Department: Support
- Contact: phone: 555-1234

### Reference Information
- Escalation Process: SLA guidelines and procedures
- Customer Communication: Best practices for customer interactions

### Tacit Knowledge
- Escalation Examples: Real case studies from past escalations"""
        }
    ]
    
    print("\n" + "="*60)
    print("Running Test Cases")
    print("="*60)
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test['query'][:50]}... ---")
        
        # Create mock IntermediateInfo
        intermediate = IntermediateInfo(
            selected_person={
                "name": test["search_results"][0]["authors"][0] if test["search_results"] else "Unknown",
                "department": test["search_results"][0]["department"] if test["search_results"] else "Unknown",
                "contact": {"type": "email", "value": "test@example.com"},
                "languages": ["en"]
            },
            search_summary=[{"title": r["title"], "snippet": r["snippet"]} for r in test["search_results"][:3]],
            tacit_knowledge=[{"title": r["title"], "snippet": r["snippet"]} for r in test["tacit_results"][:3]]
        )
        
        # 1. Generation Phase
        print("\n  📝 Generation Phase:")
        context = ace.generate(
            query=test["query"],
            profile=test["profile"],
            keywords=test["keywords"],
            search_results=test["search_results"],
            tacit_results=test["tacit_results"],
            intermediate=intermediate
        )
        print(f"     - Query length: {context['query_length']} words")
        print(f"     - Keywords: {context['keywords']['count']}")
        print(f"     - Results: {context['search_coverage']['total_results']}")
        
        # 2. Reflection Phase
        print("\n  🔍 Reflection Phase:")
        insights = ace.reflect(
            context=context,
            response=test["response"],
            execution_time_ms=120.5
        )
        print(f"     - Quality score: {insights['quality_indicators']['overall_score']:.2f}")
        print(f"     - Patterns found: {len(insights['patterns'])}")
        print(f"     - Suggestions: {len(insights['suggestions'])}")
        
        for pattern in insights['patterns']:
            print(f"       • {pattern['description']}")
        
        # 3. Curation Phase
        print("\n  💾 Curation Phase:")
        deltas = ace.curate(insights)
        print(f"     - Delta items added: {len(deltas)}")
        print(f"     - Total context items: {len(ace.context_store)}")
        
        # Show current instructions
        if i == len(test_cases):
            print("\n  📚 Accumulated Context Instructions:")
            instructions = ace.get_context_instructions(test["query"], test["profile"])
            if instructions:
                for line in instructions.split("\n")[:5]:
                    print(f"     {line}")
                if len(instructions.split("\n")) > 5:
                    print(f"     ... ({len(instructions.split('\n')) - 5} more lines)")
            else:
                print("     (No instructions yet)")
    
    # Final Statistics
    print("\n" + "="*60)
    print("Final ACE Statistics")
    print("="*60)
    
    stats = ace.get_statistics()
    print(f"\nTotal items: {stats['total_items']}")
    print(f"Successful patterns: {stats['successful_patterns']}")
    print(f"Improvement strategies: {stats['improvement_strategies']}")
    print(f"Average quality score: {stats['avg_quality_score']:.2f}")
    print(f"\nOldest item: {stats['oldest_item']}")
    print(f"Newest item: {stats['newest_item']}")
    
    # Show learning progression
    print("\n" + "="*60)
    print("Learning Progression")
    print("="*60)
    
    print("\nContext Store Items (last 10):")
    for item in ace.context_store[-10:]:
        item_type = item.get('type', 'unknown')
        if item_type == 'successful_pattern':
            pattern = item.get('pattern', {})
            score = item.get('quality_score', 0)
            print(f"  ✓ [{score:.2f}] Pattern: {pattern.get('description', 'N/A')[:60]}")
        elif item_type == 'improvement_strategy':
            strategy = item.get('strategy', 'N/A')
            print(f"  → Strategy: {strategy[:60]}")
    
    print("\n" + "="*60)
    print("✅ ACE Agent Test Complete!")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(test_ace_agent())
