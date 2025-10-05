/**
 * Tests for File Security Scanner
 */

import { FileSecurityScanner } from '../file-security-scanner';
import { S3Client } from '@aws-sdk/client-s3';

// Mock S3Client
jest.mock('@aws-sdk/client-s3');

describe('FileSecurityScanner', () => {
  let scanner: FileSecurityScanner;

  beforeEach(() => {
    jest.clearAllMocks();
    scanner = new FileSecurityScanner('us-east-1');
  });

  describe('quickValidate', () => {
    it('should allow valid file types', async () => {
      const result = await scanner.quickValidate('document.pdf', 1024 * 1024);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block dangerous file types', async () => {
      const result = await scanner.quickValidate('malware.exe', 1024);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked by security policy');
    });

    it('should block files exceeding size limit', async () => {
      const result = await scanner.quickValidate('large.pdf', 200 * 1024 * 1024);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum allowed size');
    });

    it('should allow files within size limit', async () => {
      const result = await scanner.quickValidate('small.pdf', 1024 * 1024);

      expect(result.allowed).toBe(true);
    });
  });

  describe('scanFile', () => {
    it('should detect EICAR test virus', async () => {
      const mockS3Client = new S3Client({});
      (mockS3Client.send as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({
          ContentLength: 68,
          ContentType: 'text/plain',
          ServerSideEncryption: undefined
        })
        .mockResolvedValueOnce({
          Body: {
            async *[Symbol.asyncIterator]() {
              yield Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
            }
          }
        });

      (scanner as any).s3Client = mockS3Client;

      const result = await scanner.scanFile('test-bucket', 'test-file.txt');

      expect(result.scanStatus).toBe('infected');
      expect(result.threatsFound.length).toBeGreaterThan(0);
      expect(result.threatsFound[0].threatName).toContain('EICAR');
      expect(result.securityScore).toBeLessThan(100);
    });

    it('should detect suspicious patterns', async () => {
      const mockS3Client = new S3Client({});
      (mockS3Client.send as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({
          ContentLength: 100,
          ContentType: 'text/plain',
          ServerSideEncryption: undefined
        })
        .mockResolvedValueOnce({
          Body: {
            async *[Symbol.asyncIterator]() {
              yield Buffer.from('powershell -encodedcommand ABC123');
            }
          }
        });

      (scanner as any).s3Client = mockS3Client;

      const result = await scanner.scanFile('test-bucket', 'script.txt');

      expect(result.scanStatus).toBe('suspicious');
      expect(result.threatsFound.some(t => t.threatName.includes('PowerShell'))).toBe(true);
    });

    it('should pass clean files', async () => {
      const mockS3Client = new S3Client({});
      (mockS3Client.send as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({
          ContentLength: 50,
          ContentType: 'text/plain',
          ServerSideEncryption: undefined
        })
        .mockResolvedValueOnce({
          Body: {
            async *[Symbol.asyncIterator]() {
              yield Buffer.from('This is a clean text file with no threats');
            }
          }
        });

      (scanner as any).s3Client = mockS3Client;

      const result = await scanner.scanFile('test-bucket', 'clean.txt');

      expect(result.scanStatus).toBe('clean');
      expect(result.threatsFound).toHaveLength(0);
      expect(result.securityScore).toBe(100);
    });

    it('should handle scan errors gracefully', async () => {
      const mockS3Client = new S3Client({});
      (mockS3Client.send as jest.Mock) = jest.fn().mockRejectedValue(new Error('S3 error'));

      (scanner as any).s3Client = mockS3Client;

      const result = await scanner.scanFile('test-bucket', 'error.txt');

      expect(result.scanStatus).toBe('error');
      expect(result.securityScore).toBe(0);
    });
  });

  describe('file type validation', () => {
    it('should block executable files', async () => {
      const policy = {
        allowedFileTypes: ['.pdf', '.doc'],
        blockedFileTypes: ['.exe', '.dll'],
        maxFileSizeBytes: 10 * 1024 * 1024,
        requireVirusScan: true,
        quarantineOnThreat: true,
        allowExecutables: false,
        allowScripts: false,
        allowArchives: true
      };

      const result = await scanner.quickValidate('program.exe', 1024, policy);

      expect(result.allowed).toBe(false);
    });

    it('should block script files when not allowed', async () => {
      const policy = {
        allowedFileTypes: [],
        blockedFileTypes: [],
        maxFileSizeBytes: 10 * 1024 * 1024,
        requireVirusScan: true,
        quarantineOnThreat: true,
        allowExecutables: false,
        allowScripts: false,
        allowArchives: true
      };

      const result = await scanner.quickValidate('script.ps1', 1024, policy);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Script files are not allowed');
    });

    it('should allow archives when permitted', async () => {
      const policy = {
        allowedFileTypes: ['.zip'],
        blockedFileTypes: [],
        maxFileSizeBytes: 10 * 1024 * 1024,
        requireVirusScan: true,
        quarantineOnThreat: true,
        allowExecutables: false,
        allowScripts: false,
        allowArchives: true
      };

      const result = await scanner.quickValidate('archive.zip', 1024, policy);

      expect(result.allowed).toBe(true);
    });
  });
});
