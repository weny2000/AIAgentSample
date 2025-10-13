/**
 * Tests for Encryption Service
 */

import { EncryptionService } from '../encryption-service';
import { KMSClient } from '@aws-sdk/client-kms';

// Mock KMSClient
jest.mock('@aws-sdk/client-kms');

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockKeyId = 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EncryptionService('us-east-1', mockKeyId);
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const plaintext = 'Sensitive data to encrypt';

      const mockKMSClient = new KMSClient({});
      (mockKMSClient.send as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted-data'),
          KeyId: mockKeyId
        })
        .mockResolvedValueOnce({
          Plaintext: Buffer.from(plaintext),
          KeyId: mockKeyId
        });

      (service as any).kmsClient = mockKMSClient;

      // Encrypt
      const encrypted = await service.encrypt(plaintext);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.keyId).toBe(mockKeyId);

      // Decrypt
      const decrypted = await service.decrypt(encrypted.encryptedData);
      expect(decrypted.decryptedData).toBe(plaintext);
    });

    it('should use encryption context', async () => {
      const plaintext = 'Sensitive data';
      const context = {
        resourceType: 'work_task',
        resourceId: 'task-123',
        userId: 'user-456'
      };

      const mockKMSClient = new KMSClient({});
      const mockSend = jest.fn()
        .mockResolvedValueOnce({
          CiphertextBlob: Buffer.from('encrypted-data'),
          KeyId: mockKeyId
        })
        .mockResolvedValueOnce({
          Plaintext: Buffer.from(plaintext),
          KeyId: mockKeyId
        });

      (mockKMSClient.send as jest.Mock) = mockSend;
      (service as any).kmsClient = mockKMSClient;

      // Encrypt with context
      const encrypted = await service.encrypt(plaintext, mockKeyId, context);
      expect(encrypted.encryptionContext).toEqual(context);

      // Verify context was passed to KMS
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            EncryptionContext: context
          })
        })
      );
    });

    it('should throw error when no key ID provided', async () => {
      const serviceWithoutKey = new EncryptionService('us-east-1');
      
      await expect(serviceWithoutKey.encrypt('data')).rejects.toThrow('No KMS key ID provided');
    });
  });

  describe('generateDataKey', () => {
    it('should generate data key for envelope encryption', async () => {
      const mockKMSClient = new KMSClient({});
      (mockKMSClient.send as jest.Mock) = jest.fn().mockResolvedValue({
        Plaintext: Buffer.from('plaintext-key-32-bytes-long!!!'),
        CiphertextBlob: Buffer.from('encrypted-key'),
        KeyId: mockKeyId
      });

      (service as any).kmsClient = mockKMSClient;

      const dataKey = await service.generateDataKey();

      expect(dataKey.plaintextKey).toBeDefined();
      expect(dataKey.encryptedKey).toBeDefined();
      expect(dataKey.keyId).toBe(mockKeyId);
    });
  });

  describe('encryptLargeData and decryptLargeData', () => {
    it('should encrypt and decrypt large data using envelope encryption', async () => {
      const largeData = 'A'.repeat(10000); // 10KB of data

      const mockKMSClient = new KMSClient({});
      (mockKMSClient.send as jest.Mock) = jest.fn()
        // generateDataKey call
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('12345678901234567890123456789012'), // 32 bytes
          CiphertextBlob: Buffer.from('encrypted-key'),
          KeyId: mockKeyId
        })
        // decrypt call
        .mockResolvedValueOnce({
          Plaintext: Buffer.from('12345678901234567890123456789012'),
          KeyId: mockKeyId
        });

      (service as any).kmsClient = mockKMSClient;

      // Encrypt
      const encrypted = await service.encryptLargeData(largeData);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.encryptedDataKey).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      // Decrypt
      const decrypted = await service.decryptLargeData(
        encrypted.encryptedData,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(largeData);
    });
  });

  describe('field encryption', () => {
    it('should encrypt field in object', async () => {
      const obj = {
        id: '123',
        name: 'Test',
        sensitiveData: 'Secret information'
      };

      const mockKMSClient = new KMSClient({});
      (mockKMSClient.send as jest.Mock) = jest.fn().mockResolvedValue({
        CiphertextBlob: Buffer.from('encrypted-data'),
        KeyId: mockKeyId
      });

      (service as any).kmsClient = mockKMSClient;

      const encrypted = await service.encryptField(obj, 'sensitiveData');

      expect(encrypted.sensitiveData).not.toBe('Secret information');
      expect(encrypted.sensitiveData_encrypted).toBe(true);
      expect(encrypted.sensitiveData_key_id).toBe(mockKeyId);
    });

    it('should decrypt field in object', async () => {
      const encryptedObj = {
        id: '123',
        name: 'Test',
        sensitiveData: 'ZW5jcnlwdGVkLWRhdGE=',
        sensitiveData_encrypted: true,
        sensitiveData_key_id: mockKeyId
      };

      const mockKMSClient = new KMSClient({});
      (mockKMSClient.send as jest.Mock) = jest.fn().mockResolvedValue({
        Plaintext: Buffer.from('Secret information'),
        KeyId: mockKeyId
      });

      (service as any).kmsClient = mockKMSClient;

      const decrypted = await service.decryptField(encryptedObj, 'sensitiveData');

      expect(decrypted.sensitiveData).toBe('Secret information');
      expect(decrypted.sensitiveData_encrypted).toBeUndefined();
      expect(decrypted.sensitiveData_key_id).toBeUndefined();
    });
  });

  describe('utility functions', () => {
    it('should hash data', () => {
      const data = 'sensitive-data';
      const hash = service.hashData(data);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA256 produces 64 hex characters
      expect(hash).not.toBe(data);
    });

    it('should generate secure random token', () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should create encryption context', () => {
      const context = service.createEncryptionContext(
        'work_task',
        'task-123',
        'user-456',
        'team-789'
      );

      expect(context.resourceType).toBe('work_task');
      expect(context.resourceId).toBe('task-123');
      expect(context.userId).toBe('user-456');
      expect(context.teamId).toBe('team-789');
      expect(context.timestamp).toBeDefined();
    });

    it('should validate encryption context', () => {
      const validContext = {
        resourceType: 'work_task',
        resourceId: 'task-123',
        userId: 'user-456'
      };

      const invalidContext = {
        resourceType: 'work_task',
        resourceId: ''
      };

      expect(service.validateEncryptionContext(validContext, ['resourceType', 'resourceId', 'userId'])).toBe(true);
      expect(service.validateEncryptionContext(invalidContext, ['resourceType', 'resourceId', 'userId'])).toBe(false);
    });
  });

  describe('key management', () => {
    it('should set and get default key ID', () => {
      const newKeyId = 'new-key-id';
      service.setDefaultKeyId(newKeyId);

      expect(service.getDefaultKeyId()).toBe(newKeyId);
    });

    it('should clear key cache', () => {
      service.clearKeyCache();
      // No error should be thrown
      expect(true).toBe(true);
    });
  });
});
