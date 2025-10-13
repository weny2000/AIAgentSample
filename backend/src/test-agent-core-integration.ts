/**
 * AgentCore Integration Test
 * Tests the integration between AgentCore and all dependent services
 */

import { AgentCoreService } from './services/agent-core-service';
import { PersonaRepository } from './repositories/persona-repository';
import { AuditLogRepository } from './repositories/audit-log-repository';
import { ConversationRepository } from './repositories/conversation-repository';
import { KendraSearchService } from './services/kendra-search-service';
import { RulesEngineService } from './rules-engine/rules-engine-service';
import { ConversationManagementService } from './services/conversation-management-service';
import { NotificationService } from './services/notification-service';
import { Logger } from './lambda/utils/logger';

async function testAgentCoreIntegration() {
  console.log('🧪 Testing AgentCore Service Integration');
  console.log('=====================================');

  try {
    // Initialize all services
    console.log('📦 Initializing services...');
    
    const repositoryConfig = {
      region: process.env.AWS_REGION || 'us-east-1',
      tableName: process.env.DYNAMODB_TABLE_NAME || 'ai-agent-system-test'
    };
    
    const logger = new Logger('test-agent-core-integration');
    const personaRepository = new PersonaRepository(repositoryConfig);
    const auditRepository = new AuditLogRepository(repositoryConfig);
    const conversationRepository = new ConversationRepository(repositoryConfig);
    const kendraService = new KendraSearchService();
    const rulesEngine = RulesEngineService.getInstance();
    const conversationService = new ConversationManagementService(conversationRepository, logger);
    const notificationService = new NotificationService();
    
    const agentCoreService = new AgentCoreService(
      personaRepository,
      auditRepository,
      kendraService,
      rulesEngine,
      conversationService,
      notificationService,
      logger
    );

    console.log('✅ Services initialized successfully');

    // Test 1: Start a session
    console.log('\n🚀 Test 1: Starting agent session...');
    const sessionResponse = await agentCoreService.startSession({
      userId: 'test-user-123',
      teamId: 'test-team-456',
      personaId: 'default-persona',
      initialMessage: 'Hello, I need help with security policies'
    });

    console.log(`✅ Session started: ${sessionResponse.sessionId}`);
    console.log(`   Agent: ${sessionResponse.agentConfiguration.name}`);
    console.log(`   Capabilities: ${sessionResponse.capabilities.length}`);
    console.log(`   Welcome: ${sessionResponse.welcomeMessage?.substring(0, 100)}...`);

    // Test 2: Send a message
    console.log('\n💬 Test 2: Sending message to agent...');
    const messageResponse = await agentCoreService.sendMessage({
      sessionId: sessionResponse.sessionId,
      message: 'What are the current security compliance requirements for our team?'
    });

    console.log(`✅ Message processed: ${messageResponse.messageId}`);
    console.log(`   Response: ${messageResponse.response.substring(0, 100)}...`);
    console.log(`   Confidence: ${messageResponse.confidence}`);
    console.log(`   References: ${messageResponse.references.length}`);
    console.log(`   Processing time: ${messageResponse.processingTime}ms`);

    // Test 3: Get session history
    console.log('\n📜 Test 3: Getting session history...');
    const historyResponse = await agentCoreService.getSessionHistory({
      sessionId: sessionResponse.sessionId,
      limit: 10,
      includeReferences: true
    });

    console.log(`✅ History retrieved: ${historyResponse.messages.length} messages`);
    console.log(`   Total count: ${historyResponse.totalCount}`);
    console.log(`   Has more: ${historyResponse.hasMore}`);

    // Test 4: Create conversation branch
    console.log('\n🌿 Test 4: Creating conversation branch...');
    const branch = await agentCoreService.createConversationBranch(
      sessionResponse.sessionId,
      messageResponse.messageId,
      'security-deep-dive',
      'Deep dive into security requirements'
    );

    console.log(`✅ Branch created: ${branch.branchId}`);
    console.log(`   Branch name: ${branch.branchName}`);

    // Test 5: Generate conversation summary
    console.log('\n📊 Test 5: Generating conversation summary...');
    const summary = await agentCoreService.generateConversationSummary(
      sessionResponse.sessionId,
      'periodic'
    );

    console.log(`✅ Summary generated: ${summary.summaryId}`);
    console.log(`   Key topics: ${summary.keyTopics.join(', ')}`);
    console.log(`   Action items: ${summary.actionItems.length}`);
    console.log(`   Summary: ${summary.summaryText.substring(0, 100)}...`);

    // Test 6: Get conversation insights
    console.log('\n🔍 Test 6: Getting conversation insights...');
    const insights = await agentCoreService.getConversationInsights(sessionResponse.sessionId);

    console.log(`✅ Insights extracted:`);
    console.log(`   Total messages: ${insights.totalMessages}`);
    console.log(`   User engagement: ${Math.round(insights.userEngagement * 100)}%`);
    console.log(`   Knowledge gaps: ${insights.knowledgeGaps.length}`);
    console.log(`   Recommended actions: ${insights.recommendedActions.length}`);

    // Test 7: Build memory context
    console.log('\n🧠 Test 7: Building memory context...');
    const memoryContext = await agentCoreService.buildMemoryContext(sessionResponse.sessionId);

    console.log(`✅ Memory context built:`);
    console.log(`   Short-term memory: ${memoryContext.shortTermMemory.length} messages`);
    console.log(`   Long-term memory: ${memoryContext.longTermMemory.length} summaries`);
    console.log(`   Semantic memory: ${memoryContext.semanticMemory.length} references`);
    console.log(`   Procedural memory: ${memoryContext.proceduralMemory.length} action items`);

    // Test 8: Analyze for proactive actions
    console.log('\n🎯 Test 8: Analyzing for proactive actions...');
    const proactiveAnalysis = await agentCoreService.analyzeForProactiveActions(sessionResponse.sessionId);

    console.log(`✅ Proactive analysis completed:`);
    console.log(`   Recommendations: ${proactiveAnalysis.recommendations.length}`);
    console.log(`   Notifications: ${proactiveAnalysis.notifications.length}`);
    
    if (proactiveAnalysis.recommendations.length > 0) {
      console.log(`   First recommendation: ${proactiveAnalysis.recommendations[0]}`);
    }

    // Test 9: Send proactive notification (if any were identified)
    if (proactiveAnalysis.notifications.length > 0) {
      console.log('\n📢 Test 9: Sending proactive notification...');
      const notification = proactiveAnalysis.notifications[0];
      
      await agentCoreService.sendProactiveNotification(
        sessionResponse.sessionId,
        notification.type,
        notification.message,
        notification.urgency
      );

      console.log(`✅ Proactive notification sent: ${notification.type}`);
    }

    // Test 10: End session
    console.log('\n🏁 Test 10: Ending session...');
    const finalSummary = await agentCoreService.endSession(sessionResponse.sessionId);

    console.log(`✅ Session ended successfully`);
    console.log(`   Final summary: ${finalSummary.summaryId}`);
    console.log(`   Session duration: ${finalSummary.insights.totalMessages} messages`);

    console.log('\n🎉 All integration tests passed successfully!');
    console.log('=====================================');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAgentCoreIntegration()
    .then(() => {
      console.log('✅ Integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Integration test failed:', error);
      process.exit(1);
    });
}

export { testAgentCoreIntegration };