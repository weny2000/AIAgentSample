/**
 * Encryption Service
 * Integration with AWS KMS for encryption and key management
 */

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EnableKeyRotationCommand,
  GetKeyRotationStatusCommand,
  KeyMetadata
} from '@aws-sdk/client-kms';
import { Logger } from '../lambda/utils/logger';
import * as crypto from 'crypto';

export interface EncryptionResult {
  encryptedData: string; // Base64 encoded
  keyId: string;
  algorithm: string;
  encryptionContext?: Record<string, string>;
  timestamp: string;
}

export interface DecryptionResult {
  decryptedData: string;
  keyId: string;
  timestamp: string;
}

export interface DataKeyResult {
  plaintextKey: Buffer;
  encryptedKey: string; // Base64 encoded
  keyId: string;
}

export interface EncryptionPolicy {
  policyId: string;
  resourceType: string;
  encryptionRequired: boolean;
  keyId?: string;
  algorithm: 'AES-256-GCM' | 'AES-256-CBC' | 'RSA-OAEP';
  rotationEnabled: boolean;
  rotationPeriodDays: number;
}

export class EncryptionService {
  private kmsClient: KMSClient;
  private logger: Logger;
  private keyCache: Map<string, KeyMetadata>;
  private defaultKeyId?: string;

  constructor(region: string = 'us-east-1', defaultKeyId?: string) {
    this.kmsClient = new KMSClient({ region });
    this.logger = new Logger({
      correlationId: 'encryption-service',
      operation: 'encryption'
    });
    this.keyCache = new Map();
    this.defaultKeyId = defaultKeyId || process.env.KMS_KEY_ID;
  }

  /**
   * Encrypt data using AWS KMS
   */
  async encrypt(
    plaintext: string,
    keyId?: string,
    encryptionContext?: Record<string, string>
  ): Promise<EncryptionResult> {
    const startTime = Date.now();
    const effectiveKeyId = keyId || this.defaultKeyId;

    if (!effectiveKeyId) {
      throw new Error('No KMS key ID provided and no default key configured');
    }

    this.logger.info('Encrypting data', {
      keyId: effectiveKeyId,
      dataLength: plaintext.length,
      hasContext: !!encryptionContext
    });

    try {
      const command = new EncryptCommand({
        KeyId: effectiveKeyId,
        Plaintext: Buffer.from(plaintext, 'utf-8'),
        EncryptionContext: encryptionContext
      });

      const response = await this.kmsClient.send(command);

      if (!response.CiphertextBlob) {
        throw new Error('Encryption failed: No ciphertext returned');
      }

      const result: EncryptionResult = {
        encryptedData: Buffer.from(response.CiphertextBlob).toString('base64'),
        keyId: response.KeyId || effectiveKeyId,
        algorithm: 'AES-256-GCM',
        encryptionContext,
        timestamp: new Date().toISOString()
      };

      const duration = Date.now() - startTime;
      this.logger.info('Data encrypted successfully', {
        keyId: result.keyId,
        durationMs: duration
      });

      return result;

    } catch (error) {
      this.logger.error('Encryption failed', error as Error);
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt data using AWS KMS
   */
  async decrypt(
    encryptedData: string,
    encryptionContext?: Record<string, string>
  ): Promise<DecryptionResult> {
    const startTime = Date.now();

    this.logger.info('Decrypting data', {
      dataLength: encryptedData.length,
      hasContext: !!encryptionContext
    });

    try {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedData, 'base64'),
        EncryptionContext: encryptionContext
      });

      const response = await this.kmsClient.send(command);

      if (!response.Plaintext) {
        throw new Error('Decryption failed: No plaintext returned');
      }

      const result: DecryptionResult = {
        decryptedData: Buffer.from(response.Plaintext).toString('utf-8'),
        keyId: response.KeyId || 'unknown',
        timestamp: new Date().toISOString()
      };

      const duration = Date.now() - startTime;
      this.logger.info('Data decrypted successfully', {
        keyId: result.keyId,
        durationMs: duration
      });

      return result;

    } catch (error) {
      this.logger.error('Decryption failed', error as Error);
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate data key for envelope encryption
   */
  async generateDataKey(
    keyId?: string,
    keySpec: 'AES_256' | 'AES_128' = 'AES_256'
  ): Promise<DataKeyResult> {
    const effectiveKeyId = keyId || this.defaultKeyId;

    if (!effectiveKeyId) {
      throw new Error('No KMS key ID provided and no default key configured');
    }

    this.logger.info('Generating data key', {
      keyId: effectiveKeyId,
      keySpec
    });

    try {
      const command = new GenerateDataKeyCommand({
        KeyId: effectiveKeyId,
        KeySpec: keySpec
      });

      const response = await this.kmsClient.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Data key generation failed');
      }

      const result: DataKeyResult = {
        plaintextKey: Buffer.from(response.Plaintext),
        encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64'),
        keyId: response.KeyId || effectiveKeyId
      };

      this.logger.info('Data key generated successfully', {
        keyId: result.keyId
      });

      return result;

    } catch (error) {
      this.logger.error('Data key generation failed', error as Error);
      throw new Error(`Data key generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Encrypt large data using envelope encryption
   */
  async encryptLargeData(
    plaintext: string,
    keyId?: string,
    encryptionContext?: Record<string, string>
  ): Promise<{
    encryptedData: string;
    encryptedDataKey: string;
    iv: string;
    authTag: string;
    keyId: string;
    algorithm: string;
  }> {
    this.logger.info('Encrypting large data with envelope encryption', {
      dataLength: plaintext.length
    });

    try {
      // 1. Generate data key
      const dataKey = await this.generateDataKey(keyId);

      // 2. Encrypt data with data key using AES-256-GCM
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', dataKey.plaintextKey, iv);

      let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      // 3. Clear plaintext data key from memory
      dataKey.plaintextKey.fill(0);

      const result = {
        encryptedData: encrypted,
        encryptedDataKey: dataKey.encryptedKey,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyId: dataKey.keyId,
        algorithm: 'AES-256-GCM'
      };

      this.logger.info('Large data encrypted successfully', {
        keyId: result.keyId,
        encryptedDataLength: encrypted.length
      });

      return result;

    } catch (error) {
      this.logger.error('Large data encryption failed', error as Error);
      throw new Error(`Large data encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt large data using envelope encryption
   */
  async decryptLargeData(
    encryptedData: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string,
    encryptionContext?: Record<string, string>
  ): Promise<string> {
    this.logger.info('Decrypting large data with envelope encryption');

    try {
      // 1. Decrypt data key using KMS
      const decryptedKeyResult = await this.decrypt(encryptedDataKey, encryptionContext);
      const dataKey = Buffer.from(decryptedKeyResult.decryptedData, 'base64');

      // 2. Decrypt data with data key
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        dataKey,
        Buffer.from(iv, 'base64')
      );

      decipher.setAuthTag(Buffer.from(authTag, 'base64'));

      let decrypted = decipher.update(encryptedData, 'base64', 'utf-8');
      decrypted += decipher.final('utf-8');

      // 3. Clear data key from memory
      dataKey.fill(0);

      this.logger.info('Large data decrypted successfully');

      return decrypted;

    } catch (error) {
      this.logger.error('Large data decryption failed', error as Error);
      throw new Error(`Large data decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Create a new KMS key
   */
  async createKey(
    description: string,
    tags?: Record<string, string>
  ): Promise<string> {
    this.logger.info('Creating new KMS key', { description });

    try {
      const tagList = tags
        ? Object.entries(tags).map(([key, value]) => ({
            TagKey: key,
            TagValue: value
          }))
        : undefined;

      const command = new CreateKeyCommand({
        Description: description,
        KeyUsage: 'ENCRYPT_DECRYPT',
        Origin: 'AWS_KMS',
        Tags: tagList
      });

      const response = await this.kmsClient.send(command);

      if (!response.KeyMetadata?.KeyId) {
        throw new Error('Key creation failed: No key ID returned');
      }

      const keyId = response.KeyMetadata.KeyId;

      this.logger.info('KMS key created successfully', { keyId });

      // Enable automatic key rotation
      await this.enableKeyRotation(keyId);

      return keyId;

    } catch (error) {
      this.logger.error('Key creation failed', error as Error);
      throw new Error(`Key creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Enable automatic key rotation
   */
  async enableKeyRotation(keyId: string): Promise<void> {
    this.logger.info('Enabling key rotation', { keyId });

    try {
      const command = new EnableKeyRotationCommand({
        KeyId: keyId
      });

      await this.kmsClient.send(command);

      this.logger.info('Key rotation enabled', { keyId });

    } catch (error) {
      this.logger.error('Failed to enable key rotation', error as Error);
      throw new Error(`Failed to enable key rotation: ${(error as Error).message}`);
    }
  }

  /**
   * Get key rotation status
   */
  async getKeyRotationStatus(keyId: string): Promise<boolean> {
    try {
      const command = new GetKeyRotationStatusCommand({
        KeyId: keyId
      });

      const response = await this.kmsClient.send(command);

      return response.KeyRotationEnabled || false;

    } catch (error) {
      this.logger.error('Failed to get key rotation status', error as Error);
      return false;
    }
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(keyId: string): Promise<KeyMetadata> {
    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    try {
      const command = new DescribeKeyCommand({
        KeyId: keyId
      });

      const response = await this.kmsClient.send(command);

      if (!response.KeyMetadata) {
        throw new Error('Key metadata not found');
      }

      // Cache metadata
      this.keyCache.set(keyId, response.KeyMetadata);

      return response.KeyMetadata;

    } catch (error) {
      this.logger.error('Failed to get key metadata', error as Error);
      throw new Error(`Failed to get key metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Encrypt field in object
   */
  async encryptField(
    obj: Record<string, any>,
    fieldName: string,
    keyId?: string,
    encryptionContext?: Record<string, string>
  ): Promise<Record<string, any>> {
    if (!obj[fieldName]) {
      return obj;
    }

    const plaintext = typeof obj[fieldName] === 'string'
      ? obj[fieldName]
      : JSON.stringify(obj[fieldName]);

    const encrypted = await this.encrypt(plaintext, keyId, encryptionContext);

    return {
      ...obj,
      [fieldName]: encrypted.encryptedData,
      [`${fieldName}_encrypted`]: true,
      [`${fieldName}_key_id`]: encrypted.keyId
    };
  }

  /**
   * Decrypt field in object
   */
  async decryptField(
    obj: Record<string, any>,
    fieldName: string,
    encryptionContext?: Record<string, string>
  ): Promise<Record<string, any>> {
    if (!obj[`${fieldName}_encrypted`]) {
      return obj;
    }

    const decrypted = await this.decrypt(obj[fieldName], encryptionContext);

    // Try to parse as JSON, otherwise return as string
    let value: any;
    try {
      value = JSON.parse(decrypted.decryptedData);
    } catch {
      value = decrypted.decryptedData;
    }

    const result = { ...obj };
    result[fieldName] = value;
    delete result[`${fieldName}_encrypted`];
    delete result[`${fieldName}_key_id`];

    return result;
  }

  /**
   * Hash sensitive data (one-way)
   */
  hashData(data: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate encryption context
   */
  validateEncryptionContext(
    context: Record<string, string>,
    requiredKeys: string[]
  ): boolean {
    return requiredKeys.every(key => key in context && context[key].length > 0);
  }

  /**
   * Create encryption context for resource
   */
  createEncryptionContext(
    resourceType: string,
    resourceId: string,
    userId: string,
    teamId?: string
  ): Record<string, string> {
    const context: Record<string, string> = {
      resourceType,
      resourceId,
      userId,
      timestamp: new Date().toISOString()
    };

    if (teamId) {
      context.teamId = teamId;
    }

    return context;
  }

  /**
   * Clear key cache
   */
  clearKeyCache(): void {
    this.keyCache.clear();
    this.logger.info('Key cache cleared');
  }

  /**
   * Set default key ID
   */
  setDefaultKeyId(keyId: string): void {
    this.defaultKeyId = keyId;
    this.logger.info('Default key ID set', { keyId });
  }

  /**
   * Get default key ID
   */
  getDefaultKeyId(): string | undefined {
    return this.defaultKeyId;
  }
}
