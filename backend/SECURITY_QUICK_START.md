# Security Features Quick Start Guide

## Overview

This guide provides quick instructions for using the security features in the Work Task Analysis System.

## Installation

No additional installation required. All security services are included in the backend package.

## Configuration

### 1. Set Environment Variables

```bash
# Required
export AWS_REGION=us-east-1
export KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/your-key-id

# Optional
export MAX_FILE_SIZE_MB=100
export REQUIRE_VIRUS_SCAN=true
export AUTO_MASK_PII=true
export ENCRYPTION_REQUIRED=true
```

### 2. Configure AWS Permissions

Ensure your IAM role has the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "comprehend:DetectPiiEntities",
        "comprehend:ContainsPiiEntitiesEntities"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket/*"
    }
  ]
}
```

## Quick Usage

### 1. Basic Security Middleware Setup

```typescript
import { SecurityMiddleware } from './middleware/security-middleware';

// Initialize
const security = new SecurityMiddleware(
  process.env.AWS_REGION,
  process.env.KMS_KEY_ID
);

// Create security context
const securityContext = {
  userId: 'user-123',
  userRoles: ['contributor'],
  teamId: 'team-456'
};
```

### 2. Secure Task Submission

```typescript
// Your task content
const taskContent = {
  id: 'task-123',
  title: 'My Task',
  description: 'Task description',
  content: 'Detailed task content',
  submittedBy: 'user-123',
  teamId: 'team-456',
  submittedAt: new Date(),
  priority: 'high'
};

// Process with security
const secureTask = await security.processWorkTaskSubmission(
  taskContent,
  securityContext
);

// Check results
console.log(`Sensitivity Score: ${secureTask.sensitivityScore}/100`);
console.log(`Requires Approval: ${secureTask.securityMetadata?.requiresApproval}`);

// Store the secure task (content is encrypted)
await taskRepository.create(secureTask);
```

### 3. Secure File Upload

```typescript
// Upload file to S3 first
await s3.upload(bucket, key, file);

// Then scan it
const secureDeliverable = await security.processDeliverableUpload(
  fileName,
  fileSize,
  bucket,
  key,
  todoId,
  securityContext
);

// Check scan results
if (secureDeliverable.scanResult?.scanStatus === 'infected') {
  // Handle infected file
  console.error('File is infected!');
  await quarantineFile(bucket, key);
} else if (secureDeliverable.scanResult?.scanStatus === 'clean') {
  // File is safe
  await deliverableRepository.create(secureDeliverable);
}
```

### 4. Decrypt Task Content

```typescript
// Retrieve encrypted task
const encryptedTask = await taskRepository.findById(taskId);

// Decrypt with access control
const decryptedTask = await security.decryptWorkTaskContent(
  encryptedTask,
  securityContext
);

// Use decrypted content
console.log(decryptedTask.content);
```

## Common Scenarios

### Scenario 1: Detect Sensitive Data

```typescript
import { SensitiveDataProtectionService } from './services/sensitive-data-protection-service';

const service = new SensitiveDataProtectionService();

const scanResult = await service.scanContent(
  'Contact me at john@example.com or call 555-1234'
);

console.log(`Has Sensitive Data: ${scanResult.hasSensitiveData}`);
console.log(`Sensitivity Score: ${scanResult.sensitivityScore}/100`);
console.log(`Categories: ${scanResult.categories.map(c => c.category).join(', ')}`);
```

### Scenario 2: Scan File for Viruses

```typescript
import { FileSecurityScanner } from './services/file-security-scanner';

const scanner = new FileSecurityScanner();

// Quick check before upload
const quickCheck = await scanner.quickValidate('document.pdf', 1024 * 1024);
if (!quickCheck.allowed) {
  throw new Error(`File not allowed: ${quickCheck.reason}`);
}

// Full scan after upload
const scanResult = await scanner.scanFile(bucket, key);
console.log(`Scan Status: ${scanResult.scanStatus}`);
console.log(`Security Score: ${scanResult.securityScore}/100`);
```

### Scenario 3: Check User Permissions

```typescript
import { AccessControlService } from './services/access-control-service';

const accessControl = new AccessControlService();

const decision = await accessControl.checkAccess({
  userId: 'user-123',
  userRoles: ['contributor'],
  resource: 'work_task',
  resourceId: 'task-123',
  action: 'update',
  context: {
    teamId: 'team-456',
    timestamp: new Date().toISOString(),
    resourceOwner: 'user-123'
  }
});

if (!decision.allowed) {
  throw new Error(`Access denied: ${decision.reason}`);
}
```

### Scenario 4: Encrypt/Decrypt Data

```typescript
import { EncryptionService } from './services/encryption-service';

const encryption = new EncryptionService(
  process.env.AWS_REGION,
  process.env.KMS_KEY_ID
);

// Encrypt
const encrypted = await encryption.encrypt(
  'sensitive data',
  undefined,
  { resourceType: 'work_task', resourceId: 'task-123' }
);

// Decrypt
const decrypted = await encryption.decrypt(
  encrypted.encryptedData,
  { resourceType: 'work_task', resourceId: 'task-123' }
);
```

## Role-Based Access Control

### Default Roles

| Role | Priority | Scope | Permissions |
|------|----------|-------|-------------|
| Administrator | 100 | All | Full access to everything |
| Team Lead | 80 | Team | Manage team tasks, approve deliverables |
| Contributor | 50 | Own | Create and manage own tasks |
| Reviewer | 60 | Team | Review and approve deliverables |
| Viewer | 30 | Team | Read-only access |

### Add Custom Role

```typescript
security.addCustomRole({
  roleId: 'security-auditor',
  roleName: 'Security Auditor',
  description: 'Can view all security logs',
  permissions: [
    {
      resource: 'work_task',
      actions: ['read'],
      scope: 'all'
    },
    {
      resource: 'audit_log',
      actions: ['read', 'export'],
      scope: 'all'
    }
  ],
  priority: 70
});
```

## Security Thresholds

### Sensitivity Scores
- **0-25:** Low risk - No action required
- **26-50:** Medium risk - Monitor and audit
- **51-75:** High risk - Requires approval
- **76-90:** Very high risk - Requires approval and review
- **91-100:** Critical risk - Blocked automatically

### File Security Scores
- **0-50:** High risk - Quarantine or reject
- **51-75:** Medium risk - Flag for review
- **76-90:** Low risk - Allow with monitoring
- **91-100:** Clean - Allow

## Monitoring

### Get Audit Logs

```typescript
const auditLog = security.getAuditLog({
  userId: 'user-123',
  resource: 'work_task',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});

console.log(`Total access attempts: ${auditLog.length}`);
auditLog.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.action} on ${entry.resource} - ${entry.decision}`);
});
```

### Generate Security Report

```typescript
const report = await security.generateSecurityReport(
  taskId,
  scanResult
);

console.log(report);
```

## Testing

### Run Security Tests

```bash
# Test all security services
npm test -- --testPathPattern="security|encryption|access-control|sensitive-data"

# Test specific service
npm test -- --testPathPattern="sensitive-data-protection-service"
```

### Run Examples

```bash
# Run all security examples
npm run ts-node backend/src/examples/security-integration-example.ts
```

## Troubleshooting

### Issue: "No KMS key ID provided"
**Solution:** Set the `KMS_KEY_ID` environment variable or pass it to the constructor.

### Issue: "Access denied" errors
**Solution:** Check user roles and resource ownership. Review audit logs for details.

### Issue: "PII detection not working"
**Solution:** Verify AWS Comprehend is available in your region and IAM permissions are correct.

### Issue: File scan timeouts
**Solution:** Increase Lambda timeout or process large files asynchronously.

## Best Practices

1. **Always use SecurityMiddleware** for work task operations
2. **Check sensitivity scores** before storing content
3. **Scan all uploaded files** before processing
4. **Use encryption context** for additional security
5. **Review audit logs** regularly
6. **Set up alerts** for high-risk events
7. **Rotate KMS keys** regularly (automatic with AWS KMS)
8. **Test security policies** before deploying to production

## Support

For more detailed information, see:
- `backend/DATA_SECURITY_PRIVACY_IMPLEMENTATION.md` - Full implementation guide
- `backend/TASK_24_SECURITY_IMPLEMENTATION_SUMMARY.md` - Implementation summary
- `backend/src/examples/security-integration-example.ts` - Complete examples

## Next Steps

1. Configure environment variables
2. Set up AWS permissions
3. Initialize SecurityMiddleware in your handlers
4. Test with sample data
5. Monitor audit logs
6. Set up alerts for security events

For questions or issues, refer to the troubleshooting section or review the audit logs for detailed error information.
