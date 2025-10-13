/**
 * Security Integration Example
 * Demonstrates how to integrate security services into work task processing
 */

import { SecurityMiddleware, SecurityContext } from '../middleware/security-middleware';
import { WorkTaskAnalysisService } from '../services/work-task-analysis-service';
import { Logger } from '../lambda/utils/logger';

const logger = new Logger({
  correlationId: 'security-example',
  operation: 'example'
});

/**
 * Example 1: Secure Work Task Submission
 */
export async function secureWorkTaskSubmissionExample() {
  console.log('\n=== Example 1: Secure Work Task Submission ===\n');

  // Initialize security middleware
  const securityMiddleware = new SecurityMiddleware(
    'us-east-1',
    process.env.KMS_KEY_ID
  );

  // Create security context from user session
  const securityContext: SecurityContext = {
    userId: 'user-123',
    userRoles: ['contributor'],
    teamId: 'team-456',
    sessionId: 'session-789',
    sourceIp: '192.168.1.1',
    userAgent: 'Mozilla/5.0...'
  };

  // Task content with potential sensitive data
  const taskContent = {
    id: `task-${Date.now()}`,
    title: 'Implement User Authentication System',
    description: 'Need to implement OAuth2 authentication with JWT tokens',
    content: `
      We need to implement a secure authentication system with the following requirements:
      
      1. OAuth2 integration with Google and GitHub
      2. JWT token generation and validation
      3. Secure password storage with bcrypt
      4. API key management for third-party integrations
      
      Technical details:
      - Use AWS Cognito for user management
      - Store API keys in AWS Secrets Manager
      - Implement rate limiting to prevent brute force attacks
      
      Contact: john.doe@example.com for questions
      Phone: 555-1234-5678
    `,
    submittedBy: 'user-123',
    teamId: 'team-456',
    submittedAt: new Date(),
    priority: 'high',
    category: 'security',
    tags: ['authentication', 'security', 'oauth']
  };

  try {
    // Process task with security checks
    const secureTask = await securityMiddleware.processWorkTaskSubmission(
      taskContent,
      securityContext
    );

    console.log('✓ Task processed successfully');
    console.log(`  Task ID: ${secureTask.id}`);
    console.log(`  Sensitivity Score: ${secureTask.sensitivityScore}/100`);
    console.log(`  Requires Approval: ${secureTask.securityMetadata?.requiresApproval}`);
    console.log(`  Encrypted Fields: ${secureTask.securityMetadata?.encryptedFields.join(', ')}`);

    // Generate security report
    if (secureTask.securityMetadata?.scanResult) {
      const report = await securityMiddleware.generateSecurityReport(
        secureTask.id,
        secureTask.securityMetadata.scanResult
      );
      console.log('\nSecurity Report:');
      console.log(report);
    }

    return secureTask;

  } catch (error) {
    console.error('✗ Task processing failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Example 2: Secure Deliverable Upload
 */
export async function secureDeliverableUploadExample() {
  console.log('\n=== Example 2: Secure Deliverable Upload ===\n');

  const securityMiddleware = new SecurityMiddleware('us-east-1');

  const securityContext: SecurityContext = {
    userId: 'user-123',
    userRoles: ['contributor'],
    teamId: 'team-456'
  };

  // Deliverable information
  const fileName = 'authentication-design.pdf';
  const fileSize = 2 * 1024 * 1024; // 2MB
  const bucket = 'work-task-deliverables';
  const key = `deliverables/todo-789/${fileName}`;
  const todoId = 'todo-789';

  try {
    // Process deliverable with security checks
    const secureDeliverable = await securityMiddleware.processDeliverableUpload(
      fileName,
      fileSize,
      bucket,
      key,
      todoId,
      securityContext
    );

    console.log('✓ Deliverable processed successfully');
    console.log(`  File Name: ${secureDeliverable.fileName}`);
    console.log(`  Scan Status: ${secureDeliverable.scanResult?.scanStatus}`);
    console.log(`  Security Score: ${secureDeliverable.scanResult?.securityScore}/100`);
    console.log(`  Threats Found: ${secureDeliverable.scanResult?.threatsFound.length}`);

    if (secureDeliverable.scanResult?.threatsFound.length! > 0) {
      console.log('\nThreats Detected:');
      secureDeliverable.scanResult?.threatsFound.forEach(threat => {
        console.log(`  - ${threat.threatName} (${threat.severity}): ${threat.description}`);
      });
    }

    return secureDeliverable;

  } catch (error) {
    console.error('✗ Deliverable processing failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Example 3: Access Control Check
 */
export async function accessControlExample() {
  console.log('\n=== Example 3: Access Control Check ===\n');

  const securityMiddleware = new SecurityMiddleware('us-east-1');

  // Test different user roles
  const scenarios = [
    {
      name: 'Admin accessing any task',
      context: {
        userId: 'admin-001',
        userRoles: ['admin'],
        teamId: 'team-456'
      },
      resource: 'work_task' as const,
      action: 'delete' as const,
      resourceOwner: 'user-999'
    },
    {
      name: 'Contributor accessing own task',
      context: {
        userId: 'user-123',
        userRoles: ['contributor'],
        teamId: 'team-456'
      },
      resource: 'work_task' as const,
      action: 'update' as const,
      resourceOwner: 'user-123'
    },
    {
      name: 'Contributor accessing others task',
      context: {
        userId: 'user-123',
        userRoles: ['contributor'],
        teamId: 'team-456'
      },
      resource: 'work_task' as const,
      action: 'update' as const,
      resourceOwner: 'user-999'
    },
    {
      name: 'Reviewer approving deliverable',
      context: {
        userId: 'reviewer-001',
        userRoles: ['reviewer'],
        teamId: 'team-456'
      },
      resource: 'deliverable' as const,
      action: 'approve' as const
    }
  ];

  for (const scenario of scenarios) {
    try {
      await (securityMiddleware as any).checkAccessPermission(
        scenario.context,
        scenario.resource,
        'test-resource-id',
        scenario.action,
        scenario.resourceOwner
      );
      console.log(`✓ ${scenario.name}: Access granted`);
    } catch (error) {
      console.log(`✗ ${scenario.name}: ${(error as Error).message}`);
    }
  }

  // Get audit log
  console.log('\nAudit Log:');
  const auditLog = securityMiddleware.getAuditLog({
    resource: 'work_task'
  });
  console.log(`  Total entries: ${auditLog.length}`);
}

/**
 * Example 4: Decrypt Task Content
 */
export async function decryptTaskContentExample() {
  console.log('\n=== Example 4: Decrypt Task Content ===\n');

  const securityMiddleware = new SecurityMiddleware(
    'us-east-1',
    process.env.KMS_KEY_ID
  );

  // First, create an encrypted task
  const securityContext: SecurityContext = {
    userId: 'user-123',
    userRoles: ['contributor'],
    teamId: 'team-456'
  };

  const taskContent = {
    id: `task-${Date.now()}`,
    title: 'Test Task',
    description: 'Test description',
    content: 'Test content with sensitive information',
    submittedBy: 'user-123',
    teamId: 'team-456',
    submittedAt: new Date(),
    priority: 'medium'
  };

  try {
    // Encrypt
    const encryptedTask = await securityMiddleware.processWorkTaskSubmission(
      taskContent,
      securityContext
    );

    console.log('✓ Task encrypted');
    console.log(`  Encrypted content length: ${encryptedTask.content.length}`);

    // Decrypt
    const decryptedTask = await securityMiddleware.decryptWorkTaskContent(
      encryptedTask,
      securityContext
    );

    console.log('✓ Task decrypted');
    console.log(`  Original content: ${taskContent.content}`);
    console.log(`  Decrypted content: ${decryptedTask.content}`);
    console.log(`  Match: ${taskContent.content === decryptedTask.content || 'Content was masked'}`);

  } catch (error) {
    console.error('✗ Encryption/Decryption failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Example 5: Role Management
 */
export async function roleManagementExample() {
  console.log('\n=== Example 5: Role Management ===\n');

  const securityMiddleware = new SecurityMiddleware('us-east-1');

  // Get all default roles
  const roles = securityMiddleware.getAllRoles();
  console.log('Default Roles:');
  roles.forEach(role => {
    console.log(`  - ${role.roleName} (${role.roleId}): ${role.description}`);
    console.log(`    Priority: ${role.priority}`);
    console.log(`    Permissions: ${role.permissions.length}`);
  });

  // Add custom role
  const customRole = {
    roleId: 'security-auditor',
    roleName: 'Security Auditor',
    description: 'Can view all security logs and reports',
    permissions: [
      {
        resource: 'work_task' as const,
        actions: ['read' as const],
        scope: 'all' as const
      },
      {
        resource: 'audit_log' as const,
        actions: ['read' as const, 'export' as const],
        scope: 'all' as const
      }
    ],
    priority: 70
  };

  securityMiddleware.addCustomRole(customRole);
  console.log('\n✓ Custom role added: Security Auditor');
}

/**
 * Example 6: Sensitive Data Detection Patterns
 */
export async function sensitiveDataDetectionExample() {
  console.log('\n=== Example 6: Sensitive Data Detection ===\n');

  const securityMiddleware = new SecurityMiddleware('us-east-1');

  const testCases = [
    {
      name: 'Email and Phone',
      content: 'Contact me at john.doe@example.com or call 555-123-4567'
    },
    {
      name: 'AWS Credentials',
      content: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    },
    {
      name: 'API Keys',
      content: 'api_key: sk_live_51H8xyzABCDEF123456789'
    },
    {
      name: 'Database Connection',
      content: 'mongodb://username:password@localhost:27017/mydb'
    },
    {
      name: 'Clean Content',
      content: 'This is a regular task description without any sensitive information'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    
    const securityContext: SecurityContext = {
      userId: 'user-123',
      userRoles: ['contributor'],
      teamId: 'team-456'
    };

    const taskContent = {
      id: `task-${Date.now()}`,
      title: testCase.name,
      description: 'Test',
      content: testCase.content,
      submittedBy: 'user-123',
      teamId: 'team-456',
      submittedAt: new Date(),
      priority: 'medium'
    };

    try {
      const secureTask = await securityMiddleware.processWorkTaskSubmission(
        taskContent,
        securityContext
      );

      console.log(`  Sensitivity Score: ${secureTask.sensitivityScore}/100`);
      console.log(`  Categories: ${secureTask.securityMetadata?.scanResult.categories.map(c => c.category).join(', ') || 'None'}`);
      console.log(`  Requires Approval: ${secureTask.securityMetadata?.requiresApproval}`);
    } catch (error) {
      console.log(`  Error: ${(error as Error).message}`);
    }
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Security Integration Examples                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await secureWorkTaskSubmissionExample();
    await secureDeliverableUploadExample();
    await accessControlExample();
    await decryptTaskContentExample();
    await roleManagementExample();
    await sensitiveDataDetectionExample();

    console.log('\n✓ All examples completed successfully\n');
  } catch (error) {
    console.error('\n✗ Examples failed:', error);
  }
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
