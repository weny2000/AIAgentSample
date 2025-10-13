# Enhanced Knowledge Search Service

## Overview

The Enhanced Knowledge Search Service provides intelligent, context-aware search capabilities with semantic similarity, historical learning, and pattern recognition. It significantly improves search accuracy and relevance for work task analysis by learning from past searches and understanding the semantic meaning of queries.

## Features

### 🎯 Semantic Similarity
- Calculates semantic relevance using cosine similarity
- Understands context beyond keyword matching
- Weights title matches higher than excerpt matches
- Considers contextual keywords for enhanced relevance

### 📚 Historical Learning
- Learns from past successful searches
- Tracks query-result patterns
- Updates success rates based on user feedback
- Provides search recommendations based on team history

### 🔍 Pattern Matching
- Recognizes technical terms (camelCase, PascalCase, hyphenated)
- Identifies domain-specific keywords
- Matches learned patterns from historical data
- Extracts and matches quoted phrases

### 🧮 Combined Scoring Algorithm
```
Combined Score = (
  Kendra Confidence × 0.25 +
  Semantic Score × 0.35 +
  Historical Relevance × 0.25 +
  Pattern Match Score × 0.15
)
```

## Usage

### Basic Search

```typescript
import { EnhancedKnowledgeSearchService } from './services/enhanced-knowledge-search-service';

const searchService = new EnhancedKnowledgeSearchService();

const request = {
  query: 'API authentication security',
  teamId: 'my-team',
  limit: 10,
  semanticBoost: true
};

const results = await searchService.enhancedSearch(request);

results.results.forEach(result => {
  console.log(`${result.title} - Score: ${result.combinedScore}`);
  console.log(`  Semantic: ${result.semanticScore}`);
  console.log(`  Historical: ${result.historicalRelevance}`);
  console.log(`  Patterns: ${result.matchedPatterns.join(', ')}`);
});
```

### Search with Context

```typescript
const contextualRequest = {
  query: 'database design',
  teamId: 'my-team',
  limit: 10,
  semanticBoost: true,
  contextualKeywords: ['PostgreSQL', 'scalability', 'performance'],
  taskCategory: 'development',
  includeHistoricalPatterns: true
};

const results = await searchService.enhancedSearch(contextualRequest);
```

### Get Search Recommendations

```typescript
// Get top search recommendations for a team
const recommendations = await searchService.getSearchRecommendations('my-team');

// Get recommendations filtered by context
const contextRecommendations = await searchService.getSearchRecommendations(
  'my-team',
  'security'
);
```

### Submit Feedback

```typescript
// Submit positive feedback
await searchService.submitSearchFeedback(
  'query-id-123',
  'result-id-456',
  'positive'
);

// Submit negative feedback
await searchService.submitSearchFeedback(
  'query-id-123',
  'result-id-789',
  'negative'
);
```

## Integration with Work Task Analysis

The enhanced search is automatically integrated into the Work Task Analysis Service:

```typescript
import { WorkTaskAnalysisService } from './services/work-task-analysis-service';

const analysisService = new WorkTaskAnalysisService(
  kendraService,
  rulesEngine,
  auditRepository,
  logger
);

const taskContent = {
  id: 'task-1',
  title: 'Implement OAuth2 Authentication',
  description: 'Add OAuth2 authentication to the API',
  content: 'Need to implement OAuth2 with JWT tokens...',
  submittedBy: 'user-1',
  teamId: 'team-1',
  submittedAt: new Date(),
  category: 'security',
  tags: ['OAuth2', 'JWT', 'authentication']
};

// Enhanced search is used automatically
const analysis = await analysisService.analyzeWorkTask(taskContent);

// Knowledge references include enhanced metadata
analysis.knowledgeReferences.forEach(ref => {
  console.log(`${ref.title} - Relevance: ${ref.relevanceScore}`);
  if (ref.metadata) {
    console.log(`  Semantic: ${ref.metadata.semanticScore}`);
    console.log(`  Historical: ${ref.metadata.historicalRelevance}`);
    console.log(`  Patterns: ${ref.metadata.matchedPatterns}`);
  }
});
```

## Configuration

### Environment Variables

```bash
# DynamoDB tables for historical learning
SEARCH_HISTORY_TABLE=search_history
SEARCH_PATTERNS_TABLE=search_patterns

# Kendra configuration
KENDRA_INDEX_ID=your-kendra-index-id

# AWS region
AWS_REGION=us-east-1
```

### DynamoDB Table Schemas

#### search_history Table
```
Partition Key: queryId (String)
Attributes:
  - query (String)
  - teamId (String)
  - timestamp (String)
  - resultIds (List)
  - userFeedback (String)
  - taskCategory (String)
  - contextKeywords (List)
  - ttl (Number) - 90 days retention
```

#### search_patterns Table
```
Partition Key: teamId (String)
Sort Key: patternId (String)
Attributes:
  - queryPattern (String)
  - resultPatterns (List)
  - frequency (Number)
  - successRate (Number)
  - lastUsed (String)
```

## Scoring Details

### Semantic Similarity Calculation

1. **Tokenization**: Remove stop words and special characters
2. **Cosine Similarity**: Calculate similarity between query and result tokens
3. **Weighted Scoring**:
   - Title similarity: 40%
   - Excerpt similarity: 30%
   - Context similarity: 30%

### Historical Relevance Calculation

1. Find similar historical queries (similarity > 0.6)
2. Check if result appeared in successful past searches
3. Weight by pattern success rate and frequency
4. Formula: `successRate × log(frequency + 1) × 0.1`

### Pattern Matching

1. **Technical Patterns**: camelCase, PascalCase, hyphenated terms
2. **Domain Keywords**: API, REST, GraphQL, database, security, etc.
3. **Learned Patterns**: Patterns from historical successful searches
4. Each match adds 0.15-0.20 to the score

## Performance Considerations

### Optimization Strategies

1. **Caching**: Results cached with TTL for repeated queries
2. **Batch Processing**: Multiple searches processed in parallel
3. **Lazy Loading**: Historical patterns loaded only when needed
4. **Efficient Deduplication**: Set-based duplicate removal
5. **Optimized Similarity**: Fast cosine similarity calculation

### Scalability

- DynamoDB provides distributed storage for patterns
- Asynchronous pattern updates don't block search
- Configurable result limits prevent memory issues
- TTL-based automatic cleanup of old data

## Testing

### Run Unit Tests

```bash
cd backend
npm test enhanced-knowledge-search-service.test.ts
```

### Run Integration Tests

```bash
cd backend
npm test enhanced-search-integration.test.ts
```

### Run Demo

```bash
cd backend
npx ts-node src/examples/enhanced-search-demo.ts
```

## Monitoring

### Key Metrics to Track

1. **Search Performance**
   - Average search latency
   - Cache hit rate
   - Pattern match rate

2. **Learning Effectiveness**
   - Pattern success rate trends
   - User feedback distribution
   - Recommendation click-through rate

3. **Quality Metrics**
   - Average combined score
   - Semantic score distribution
   - Historical relevance utilization

### CloudWatch Metrics

```typescript
// Example metric publishing
await cloudwatch.putMetricData({
  Namespace: 'EnhancedSearch',
  MetricData: [
    {
      MetricName: 'SearchLatency',
      Value: latencyMs,
      Unit: 'Milliseconds'
    },
    {
      MetricName: 'SemanticScore',
      Value: avgSemanticScore,
      Unit: 'None'
    }
  ]
});
```

## Troubleshooting

### Low Semantic Scores

**Problem**: All semantic scores are very low

**Solutions**:
- Check if stop words are being removed correctly
- Verify tokenization is working properly
- Ensure contextual keywords are being extracted
- Review query and result content for relevance

### No Historical Patterns

**Problem**: Historical relevance always 0

**Solutions**:
- Verify DynamoDB tables are created
- Check IAM permissions for DynamoDB access
- Ensure searches are being recorded
- Wait for pattern frequency threshold (minimum 2)

### Pattern Matching Not Working

**Problem**: Pattern match scores always 0

**Solutions**:
- Verify technical term extraction is working
- Check if domain keywords are configured
- Review learned patterns in DynamoDB
- Ensure pattern similarity threshold is appropriate

## Best Practices

### Query Optimization

1. **Use Specific Terms**: More specific queries yield better semantic matches
2. **Include Context**: Provide contextual keywords when available
3. **Specify Category**: Task category helps filter relevant patterns
4. **Enable Historical**: Set `includeHistoricalPatterns: true` for established teams

### Feedback Loop

1. **Encourage Feedback**: Prompt users to rate search results
2. **Monitor Success Rates**: Track pattern success rates over time
3. **Adjust Thresholds**: Fine-tune similarity and frequency thresholds
4. **Review Patterns**: Periodically review learned patterns for quality

### Performance Tuning

1. **Limit Results**: Use appropriate result limits (default: 10-15)
2. **Cache Aggressively**: Cache frequently searched queries
3. **Batch Updates**: Update patterns in batches during low traffic
4. **Monitor Latency**: Track and optimize slow queries

## Future Enhancements

### Planned Features

1. **Advanced NLP**: Integration with transformer models (BERT, GPT)
2. **Collaborative Filtering**: Learn from similar teams' patterns
3. **Query Expansion**: Automatic synonym and related term expansion
4. **Real-time Learning**: Immediate pattern updates from interactions
5. **A/B Testing**: Compare different scoring algorithms

### Research Areas

1. **Neural Search**: Deep learning-based semantic search
2. **Graph-based Ranking**: Knowledge graph for result ranking
3. **Personalization**: User-specific search preferences
4. **Multi-modal Search**: Support for images, diagrams, code snippets

## Support

For issues, questions, or contributions:

1. Check the troubleshooting section above
2. Review test files for usage examples
3. Run the demo script for hands-on exploration
4. Consult the implementation summary document

## License

This implementation is part of the AI Agent Sample project.
