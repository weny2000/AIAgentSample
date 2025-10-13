/**
 * Simple verification that ConversationManagementService can be instantiated
 */

const { ConversationManagementService } = require('./services/conversation-management-service');

console.log('Verifying ConversationManagementService...');

// Mock repository
const mockRepository = {
  storeSession: () => Promise.resolve(),
  getSession: () => Promise.resolve(null),
  updateSession: () => Promise.resolve(),
  endSession: () => Promise.resolve(),
  storeMessage: () => Promise.resolve(),
  getConversationHistory: () => Promise.resolve({ messages: [], totalCount: 0, hasMore: false }),
  createBranch: () => Promise.resolve({ branchId: 'test', sessionId: 'test', parentMessageId: 'test', branchName: 'test', createdAt: new Date(), messages: [] }),
  storeSummary: () => Promise.resolve(),
  getSummaries: () => Promise.resolve([])
};

// Mock logger
const mockLogger = {
  info: (msg, meta) => console.log(`INFO: ${msg}`, meta),
  error: (msg, error, meta) => console.error(`ERROR: ${msg}`, error, meta),
  warn: (msg, meta) => console.warn(`WARN: ${msg}`, meta),
  debug: (msg, meta) => console.debug(`DEBUG: ${msg}`, meta)
};

try {
  const service = new ConversationManagementService(
    mockRepository,
    mockLogger,
    {
      maxContextLength: 1000,
      memoryRetentionDays: 30,
      summaryThreshold: 5,
      branchingEnabled: true,
      insightsEnabled: true
    }
  );

  console.log('✅ ConversationManagementService instantiated successfully');
  console.log('✅ Service has the following methods:');
  
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service))
    .filter(name => name !== 'constructor' && typeof service[name] === 'function');
  
  methods.forEach(method => {
    console.log(`  - ${method}`);
  });

  console.log('\n🎉 ConversationManagementService verification completed successfully!');

} catch (error) {
  console.error('❌ Failed to instantiate ConversationManagementService:', error);
  process.exit(1);
}