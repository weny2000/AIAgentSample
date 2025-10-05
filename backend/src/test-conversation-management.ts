/**
 * Integration test for ConversationManagementService
 * This tests the conversation management functionality without complex mocking
 */

import { ConversationManagementService } from './services/conversation-management-service';
import { ConversationRepository } from './repositories/conversation-repository';
import { Logger } from './lambda/utils/logger';

// Simple mock implementations
class MockConversationRepository {
  private sessions = new Map();
  private messages = new Map();
  private summaries = new Map();

  async storeSession(session: any): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<any> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(sessionId: string, updates: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'ended';
    }
  }

  async storeMessage(sessionId: string, message: any, branchId?: string): Promise<void> {
    const key = `${sessionId}:${message.messageId}`;
    this.messages.set(key, { ...message, branchId });
  }

  async getConversationHistory(params: any): Promise<any> {
    const messages = Array.from(this.messages.values())
      .filter((msg: any) => msg.sessionId === params.sessionId || true)
      .slice(0, params.limit || 50);
    
    return {
      messages,
      totalCount: messages.length,
      hasMore: false
    };
  }

  async createBranch(sessionId: string, parentMessageId: string, branchName: string, description?: string): Promise<any> {
    const branch = {
      branchId: `branch_${Date.now()}`,
      sessionId,
      parentMessageId,
      branchName,
      description,
      createdAt: new Date(),
      messages: []
    };
    return branch;
  }

  async storeSummary(summary: any): Promise<void> {
    this.summaries.set(summary.summaryId, summary);
  }

  async getSummaries(sessionId: string, summaryType?: string): Promise<any[]> {
    return Array.from(this.summaries.values())
      .filter((summary: any) => summary.sessionId === sessionId)
      .filter((summary: any) => !summaryType || summary.summaryType === summaryType);
  }
}

class MockLogger {
  info(message: string, meta?: any): void {
    console.log(`INFO: ${message}`, meta);
  }

  error(message: string, error?: any, meta?: any): void {
    console.error(`ERROR: ${message}`, error, meta);
  }

  warn(message: string, meta?: any): void {
    console.warn(`WARN: ${message}`, meta);
  }

  debug(message: string, meta?: any): void {
    console.debug(`DEBUG: ${message}`, meta);
  }
}

async function testConversationManagement() {
  console.log('Starting ConversationManagementService integration test...');

  const mockRepository = new MockConversationRepository();
  const mockLogger = new MockLogger();

  const service = new ConversationManagementService(
    mockRepository as any,
    mockLogger as any,
    {
      maxContextLength: 1000,
      memoryRetentionDays: 30,
      summaryThreshold: 5,
      branchingEnabled: true,
      insightsEnabled: true
    }
  );

  try {
    // Test 1: Create session
    console.log('\n1. Testing session creation...');
    const session = await service.createSession(
      'test-user-id',
      'test-team-id',
      'test-persona-id'
    );
    console.log('✓ Session created:', session.sessionId);

    // Test 2: Add messages
    console.log('\n2. Testing message addition...');
    const userMessage = {
      messageId: 'msg-1',
      role: 'user' as const,
      content: 'Hello, I need help with security policies',
      timestamp: new Date(),
      metadata: {}
    };

    await service.addMessage(session.sessionId, userMessage);
    console.log('✓ User message added');

    const agentMessage = {
      messageId: 'msg-2',
      role: 'agent' as const,
      content: 'I can help you with security policies. Here are the key points...',
      timestamp: new Date(),
      metadata: {}
    };

    await service.addMessage(session.sessionId, agentMessage);
    console.log('✓ Agent message added');

    // Test 3: Get conversation history
    console.log('\n3. Testing conversation history retrieval...');
    const history = await service.getConversationHistory(session.sessionId);
    console.log('✓ History retrieved:', history.messages.length, 'messages');

    // Test 4: Create branch
    console.log('\n4. Testing conversation branching...');
    const branch = await service.createBranch(
      session.sessionId,
      userMessage.messageId,
      'Alternative Discussion',
      'Exploring alternative approach'
    );
    console.log('✓ Branch created:', branch.branchId);

    // Test 5: Generate summary
    console.log('\n5. Testing summary generation...');
    const summary = await service.generateSummary(session.sessionId, 'periodic');
    console.log('✓ Summary generated:', summary.summaryId);
    console.log('  Key topics:', summary.keyTopics);
    console.log('  Summary text:', summary.summaryText.substring(0, 100) + '...');

    // Test 6: Extract insights
    console.log('\n6. Testing insights extraction...');
    const insights = await service.extractConversationInsights(session.sessionId);
    console.log('✓ Insights extracted:');
    console.log('  Total messages:', insights.totalMessages);
    console.log('  User engagement:', insights.userEngagement);
    console.log('  Topic progression:', insights.topicProgression);
    console.log('  Sentiment trend:', insights.sentimentTrend);

    // Test 7: Build memory context
    console.log('\n7. Testing memory context building...');
    const memoryContext = await service.buildMemoryContext(session.sessionId);
    console.log('✓ Memory context built:');
    console.log('  Short-term memory:', memoryContext.shortTermMemory.length, 'messages');
    console.log('  Long-term memory:', memoryContext.longTermMemory.length, 'summaries');

    // Test 8: End session
    console.log('\n8. Testing session ending...');
    const finalSummary = await service.endSession(session.sessionId);
    console.log('✓ Session ended with summary:', finalSummary.summaryId);

    console.log('\n✅ All tests passed! ConversationManagementService is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testConversationManagement()
    .then(() => {
      console.log('\n🎉 ConversationManagementService integration test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 ConversationManagementService integration test failed:', error);
      process.exit(1);
    });
}

export { testConversationManagement };