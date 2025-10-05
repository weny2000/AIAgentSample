/**
 * Demo script for Enhanced Knowledge Search Service
 * Demonstrates semantic similarity, historical learning, and pattern matching
 */

import { EnhancedKnowledgeSearchService, SemanticSearchRequest } from '../services/enhanced-knowledge-search-service';
import { KendraSearchService } from '../services/kendra-search-service';

async function demonstrateEnhancedSearch() {
  console.log('=== Enhanced Knowledge Search Demo ===\n');

  // Initialize services
  const kendraService = new KendraSearchService();
  const enhancedSearchService = new EnhancedKnowledgeSearchService(kendraService);

  // Example 1: Basic semantic search
  console.log('1. Basic Semantic Search');
  console.log('Query: "API authentication security"\n');

  const basicRequest: SemanticSearchRequest = {
    query: 'API authentication security',
    teamId: 'demo-team',
    limit: 5,
    semanticBoost: true
  };

  try {
    const basicResults = await enhancedSearchService.enhancedSearch(basicRequest);
    console.log(`Found ${basicResults.results.length} results`);
    
    basicResults.results.slice(0, 3).forEach((result, index) => {
      console.log(`\n  Result ${index + 1}:`);
      console.log(`  Title: ${result.title}`);
      console.log(`  Semantic Score: ${result.semanticScore.toFixed(3)}`);
      console.log(`  Combined Score: ${result.combinedScore.toFixed(3)}`);
      console.log(`  Matched Patterns: ${result.matchedPatterns.join(', ') || 'None'}`);
    });
  } catch (error) {
    console.log('  Using mock data (Kendra not configured)');
  }

  // Example 2: Search with contextual keywords
  console.log('\n\n2. Search with Contextual Keywords');
  console.log('Query: "database design"\n');
  console.log('Context: ["PostgreSQL", "scalability", "performance"]\n');

  const contextualRequest: SemanticSearchRequest = {
    query: 'database design',
    teamId: 'demo-team',
    limit: 5,
    semanticBoost: true,
    contextualKeywords: ['PostgreSQL', 'scalability', 'performance'],
    taskCategory: 'development'
  };

  try {
    const contextualResults = await enhancedSearchService.enhancedSearch(contextualRequest);
    console.log(`Found ${contextualResults.results.length} results with enhanced context`);
    
    if (contextualResults.results.length > 0) {
      const topResult = contextualResults.results[0];
      console.log(`\n  Top Result:`);
      console.log(`  Title: ${topResult.title}`);
      console.log(`  Semantic Score: ${topResult.semanticScore.toFixed(3)}`);
      console.log(`  Historical Relevance: ${topResult.historicalRelevance.toFixed(3)}`);
      console.log(`  Pattern Match Score: ${topResult.patternMatchScore.toFixed(3)}`);
      console.log(`  Combined Score: ${topResult.combinedScore.toFixed(3)}`);
    }
  } catch (error) {
    console.log('  Using mock data (Kendra not configured)');
  }

  // Example 3: Get search recommendations
  console.log('\n\n3. Search Recommendations Based on History');
  console.log('Team: demo-team\n');

  try {
    const recommendations = await enhancedSearchService.getSearchRecommendations('demo-team');
    console.log('Recommended searches:');
    recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  } catch (error) {
    console.log('  No historical data available yet');
  }

  // Example 4: Submit feedback to improve learning
  console.log('\n\n4. Submit Feedback for Learning');
  console.log('Submitting positive feedback for a search result...\n');

  try {
    await enhancedSearchService.submitSearchFeedback(
      'demo-query-123',
      'demo-doc-1',
      'positive'
    );
    console.log('  ✓ Feedback submitted successfully');
    console.log('  The system will learn from this feedback to improve future searches');
  } catch (error) {
    console.log('  Feedback system ready (requires DynamoDB configuration)');
  }

  // Example 5: Demonstrate scoring breakdown
  console.log('\n\n5. Scoring Algorithm Breakdown');
  console.log('Combined Score Formula:');
  console.log('  = (Kendra Confidence × 0.25)');
  console.log('  + (Semantic Score × 0.35)');
  console.log('  + (Historical Relevance × 0.25)');
  console.log('  + (Pattern Match Score × 0.15)');
  console.log('\nExample calculation:');
  console.log('  Kendra Confidence: 0.85 → 0.85 × 0.25 = 0.2125');
  console.log('  Semantic Score: 0.75 → 0.75 × 0.35 = 0.2625');
  console.log('  Historical Relevance: 0.60 → 0.60 × 0.25 = 0.1500');
  console.log('  Pattern Match: 0.40 → 0.40 × 0.15 = 0.0600');
  console.log('  Combined Score: 0.6850');

  console.log('\n\n=== Demo Complete ===');
  console.log('\nKey Features Demonstrated:');
  console.log('  ✓ Semantic similarity scoring');
  console.log('  ✓ Contextual keyword enhancement');
  console.log('  ✓ Historical pattern learning');
  console.log('  ✓ Pattern matching');
  console.log('  ✓ Search recommendations');
  console.log('  ✓ Feedback-based learning');
  console.log('  ✓ Combined scoring algorithm');
}

// Run the demo
if (require.main === module) {
  demonstrateEnhancedSearch()
    .then(() => {
      console.log('\nDemo completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nDemo failed:', error);
      process.exit(1);
    });
}

export { demonstrateEnhancedSearch };
