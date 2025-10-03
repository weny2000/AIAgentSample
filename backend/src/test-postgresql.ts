#!/usr/bin/env node

/**
 * Test script for PostgreSQL database setup
 * This script tests the database connection, schema initialization, and repository operations
 */

import { DatabaseConnection, getDatabase } from './database/connection.js';
import { initializeDatabase, isDatabaseInitialized, getDatabaseStatus } from './database/init.js';
import { ServiceRepository } from './repositories/service-repository.js';
import { DependencyRepository } from './repositories/dependency-repository.js';
import { PolicyRepository } from './repositories/policy-repository.js';

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  
  try {
    // Test with mock environment variables for local testing
    process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'aiagent_test';
    process.env.DB_SSL = 'false';
    process.env.AWS_REGION = 'us-east-1';

    const db = getDatabase();
    
    // Test basic connection
    const isConnected = await db.testConnection();
    console.log(`✅ Database connection: ${isConnected ? 'SUCCESS' : 'FAILED'}`);
    
    if (!isConnected) {
      console.log('❌ Cannot proceed with tests - database connection failed');
      return false;
    }

    // Get pool statistics
    const poolStats = db.getPoolStats();
    console.log('📊 Connection pool stats:', poolStats);

    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}

async function testSchemaInitialization() {
  console.log('\n🏗️  Testing schema initialization...');
  
  try {
    const db = getDatabase();
    
    // Check if database is already initialized
    const isInitialized = await isDatabaseInitialized(db);
    console.log(`📋 Database initialized: ${isInitialized}`);
    
    if (!isInitialized) {
      console.log('🔧 Initializing database schemas...');
      await initializeDatabase(db);
      console.log('✅ Database initialization completed');
    }

    // Get database status
    const status = await getDatabaseStatus(db);
    console.log('📊 Database status:', {
      isInitialized: status.isInitialized,
      tableCount: status.tables.length,
      version: status.version,
      tables: status.tables.slice(0, 5) // Show first 5 tables
    });

    return true;
  } catch (error) {
    console.error('❌ Schema initialization test failed:', error);
    return false;
  }
}

async function testServiceRepository() {
  console.log('\n🏢 Testing Service Repository...');
  
  try {
    const db = getDatabase();
    const serviceRepo = new ServiceRepository(db);

    // Test create service
    const newService = await serviceRepo.create({
      name: 'test-service',
      team_id: 'test-team',
      description: 'Test service for repository testing',
      service_type: 'api',
      metadata: { test: true }
    });
    console.log('✅ Service created:', newService.id);

    // Test get service by ID
    const retrievedService = await serviceRepo.getById(newService.id);
    console.log('✅ Service retrieved:', retrievedService?.name);

    // Test list services
    const services = await serviceRepo.list({ team_id: 'test-team' });
    console.log('✅ Services listed:', services.data.length, 'found');

    // Test update service
    const updatedService = await serviceRepo.update(newService.id, {
      description: 'Updated test service'
    });
    console.log('✅ Service updated:', updatedService?.description);

    // Test get statistics
    const stats = await serviceRepo.getStatistics();
    console.log('✅ Service statistics:', {
      total: stats.total,
      statusCount: Object.keys(stats.by_status).length
    });

    // Clean up
    await serviceRepo.delete(newService.id);
    console.log('✅ Service deleted');

    return true;
  } catch (error) {
    console.error('❌ Service repository test failed:', error);
    return false;
  }
}

async function testDependencyRepository() {
  console.log('\n🔗 Testing Dependency Repository...');
  
  try {
    const db = getDatabase();
    const serviceRepo = new ServiceRepository(db);
    const dependencyRepo = new DependencyRepository(db);

    // Create test services
    const service1 = await serviceRepo.create({
      name: 'service-1',
      team_id: 'team-1',
      description: 'First test service'
    });

    const service2 = await serviceRepo.create({
      name: 'service-2',
      team_id: 'team-2',
      description: 'Second test service'
    });

    // Test create dependency
    const newDependency = await dependencyRepo.create({
      source_service_id: service1.id,
      target_service_id: service2.id,
      dependency_type: 'api',
      criticality: 'high',
      description: 'Test dependency'
    });
    console.log('✅ Dependency created:', newDependency.id);

    // Test get dependency by ID
    const retrievedDependency = await dependencyRepo.getById(newDependency.id);
    console.log('✅ Dependency retrieved:', retrievedDependency?.dependency_type);

    // Test get dependencies by service
    const serviceDependencies = await dependencyRepo.getByServiceId(service1.id);
    console.log('✅ Service dependencies:', {
      outgoing: serviceDependencies.outgoing.length,
      incoming: serviceDependencies.incoming.length
    });

    // Test impact analysis
    const impactAnalysis = await dependencyRepo.getImpactAnalysis(service2.id);
    console.log('✅ Impact analysis:', {
      downstream: impactAnalysis.downstream.length,
      upstream: impactAnalysis.upstream.length
    });

    // Test statistics
    const stats = await dependencyRepo.getStatistics();
    console.log('✅ Dependency statistics:', {
      total: stats.total,
      crossTeam: stats.cross_team_count
    });

    // Clean up
    await dependencyRepo.delete(newDependency.id);
    await serviceRepo.delete(service1.id);
    await serviceRepo.delete(service2.id);
    console.log('✅ Dependencies and services cleaned up');

    return true;
  } catch (error) {
    console.error('❌ Dependency repository test failed:', error);
    return false;
  }
}

async function testPolicyRepository() {
  console.log('\n📋 Testing Policy Repository...');
  
  try {
    const db = getDatabase();
    const policyRepo = new PolicyRepository(db);

    // Test create rule template
    const ruleTemplate = await policyRepo.createRuleTemplate({
      name: 'test-rule-template',
      description: 'Test rule template',
      category: 'quality',
      template_json: {
        type: 'static_check',
        rules: { 'no-console': 'error' }
      },
      created_by: 'test-user'
    });
    console.log('✅ Rule template created:', ruleTemplate.id);

    // Test create policy
    const newPolicy = await policyRepo.createPolicy({
      name: 'test-policy',
      description: 'Test policy for repository testing',
      policy_json: {
        rules: [{ id: 'test-rule', template: 'test-rule-template' }],
        threshold: 80
      },
      policy_type: 'static_check',
      created_by: 'test-user'
    });
    console.log('✅ Policy created:', newPolicy.id);

    // Test get policy by ID
    const retrievedPolicy = await policyRepo.getPolicyById(newPolicy.id);
    console.log('✅ Policy retrieved:', retrievedPolicy?.name);

    // Test list policies
    const policies = await policyRepo.listPolicies({ status: 'draft' });
    console.log('✅ Policies listed:', policies.data.length, 'found');

    // Test create policy execution
    const execution = await policyRepo.createPolicyExecution({
      policy_id: newPolicy.id,
      artifact_id: 'test-artifact-123',
      artifact_type: 'javascript',
      execution_result: 'pass',
      score: 85
    });
    console.log('✅ Policy execution recorded:', execution.id);

    // Test get statistics
    const stats = await policyRepo.getPolicyStatistics();
    console.log('✅ Policy statistics:', {
      total: stats.total,
      activeTemplates: stats.active_templates
    });

    // Clean up - Note: We don't delete policies in this test to preserve data
    console.log('✅ Policy repository test completed (cleanup skipped)');

    return true;
  } catch (error) {
    console.error('❌ Policy repository test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting PostgreSQL Database Tests\n');
  
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Schema Initialization', fn: testSchemaInitialization },
    { name: 'Service Repository', fn: testServiceRepository },
    { name: 'Dependency Repository', fn: testDependencyRepository },
    { name: 'Policy Repository', fn: testPolicyRepository }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        console.log(`✅ ${test.name}: PASSED`);
      } else {
        failed++;
        console.log(`❌ ${test.name}: FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name}: ERROR -`, error.message);
    }
  }

  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  // Close database connections
  try {
    const db = getDatabase();
    await db.close();
    console.log('🔌 Database connections closed');
  } catch (error) {
    console.log('⚠️  Warning: Could not close database connections:', error.message);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

export {
  testDatabaseConnection,
  testSchemaInitialization,
  testServiceRepository,
  testDependencyRepository,
  testPolicyRepository,
  runAllTests
};