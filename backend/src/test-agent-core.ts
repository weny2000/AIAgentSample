/**
 * Simple test script for AgentCore functionality
 */

import { AgentCoreService } from './services/agent-core-service';
import { PersonaRepository } from './repositories/persona-repository';
import { AuditLogRepository } from './repositories/audit-log-repository';
import { KendraSearchService } from './services/kendra-search-service';
import { RulesEngineService } from './rules-engine/rules-engine-service';
import { Logger } from './lambda/utils/logger';

async function testAgentCore() {
  console.log('🚀 Testing AgentCore Service...');

  try {
    // Initialize dependencies
    const personaRepository = new PersonaRepository();
    const auditRepository = new AuditLogRepository();
    const kendraService = new KendraSearchService();
    const rulesEngine = RulesEngineService.getInstance();
    const logger = new Logger();

    // Create AgentCore service
    const agentCore = new AgentCoreService(
      personaRepository,
      auditRepository,
      kendraService,
      rulesEngine,
      logger
    );

    console.log('✅ AgentCore service initialized successfully');

    // Test session creation
    console.log('\n📝 Testing session creation...');
    const sessionResponse = await agentCore.startSession({
      userId: 'test-user-123',
      teamId: 'test-team-456',
      personaId: 'test-persona-789'
    });

    console.log('✅ Session created:', {
      sessionId: sessionResponse.sessionId,
      agentName: sessionResponse.agentConfiguration.name,
      capabilities: sessionResponse.capabilities.length
    });

    // Test message processing
    console.log('\n💬 Testing message processing...');
    const messageResponse = await agentCore.sendMessage({
      sessionId: sessionResponse.sessionId,
      message: 'What are the security policies for our team?'
    });

    console.log('✅ Message processed:', {
      messageId: messageResponse.messageId,
      responseLength: messageResponse.response.length,
      confidence: messageResponse.confidence,
      processingTime: messageResponse.processingTime,
      referencesCount: messageResponse.references.length,
      actionItemsCount: messageResponse.actionItems.length
    });

    // Test session history
    console.log('\n📚 Testing session history...');
    const historyResponse = await agentCore.getSessionHistory({
      sessionId: sessionResponse.sessionId,
      limit: 10,
      includeReferences: true
    });

    console.log('✅ Session history retrieved:', {
      messageCount: historyResponse.messages.length,
      totalCount: historyResponse.totalCount,
      hasMore: historyResponse.hasMore
    });

    // Test session end
    console.log('\n🔚 Testing session end...');
    await agentCore.endSession(sessionResponse.sessionId);
    console.log('✅ Session ended successfully');

    console.log('\n🎉 All AgentCore tests passed!');

  } catch (error) {
    console.error('❌ AgentCore test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAgentCore().catch(console.error);
}

export { testAgentCore };