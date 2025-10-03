import { handler } from '../handlers/fetch-artifact-handler';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the S3 client
const s3Mock = mockClient(S3Client);

// Mock fetch globally
global.fetch = jest.fn();

describe('fetch-artifact-handler', () => {
  beforeEach(() => {
    s3Mock.reset();
    (global.fetch as jest.Mock).mockReset();
    
    // Set environment variables
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('inline content handling', () => {
    it('should handle inline artifact content successfully', async () => {
      const event = {
        artifactContent: 'test content',
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result).toEqual({
        content: 'test content',
        contentType: 'text/plain',
        size: 12,
        source: 'inline',
      });
    });

    it('should calculate correct size for inline content', async () => {
      const content = 'Hello, World! 🌍';
      const event = {
        artifactContent: content,
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result.size).toBe(Buffer.byteLength(content, 'utf8'));
      expect(result.content).toBe(content);
    });
  });

  describe('S3 URL handling', () => {
    it('should fetch artifact from S3 successfully', async () => {
      const s3Content = 'S3 file content';
      const mockResponse = {
        Body: {
          transformToString: jest.fn().mockResolvedValue(s3Content),
        },
        ContentType: 'application/json',
        ContentLength: s3Content.length,
        LastModified: new Date('2023-01-01'),
        ETag: '"abc123"',
        VersionId: 'version-123',
      };

      s3Mock.on(GetObjectCommand).resolves(mockResponse);

      const event = {
        artifactUrl: 's3://test-bucket/test-key.json',
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result).toEqual({
        content: s3Content,
        contentType: 'application/json',
        size: s3Content.length,
        source: 'url',
        metadata: {
          lastModified: new Date('2023-01-01'),
          etag: '"abc123"',
          versionId: 'version-123',
        },
      });

      expect(s3Mock.calls()).toHaveLength(1);
      expect(s3Mock.call(0).args[0].input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-key.json',
      });
    });

    it('should handle S3 errors gracefully', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('Access denied'));

      const event = {
        artifactUrl: 's3://test-bucket/test-key.json',
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow('Access denied');
    });

    it('should handle missing S3 object body', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: undefined });

      const event = {
        artifactUrl: 's3://test-bucket/test-key.json',
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow('S3 object has no body');
    });
  });

  describe('HTTP URL handling', () => {
    it('should fetch artifact from HTTP URL successfully', async () => {
      const httpContent = 'HTTP response content';
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue(httpContent),
        headers: new Map([
          ['content-type', 'text/plain'],
          ['content-length', httpContent.length.toString()],
        ]),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const event = {
        artifactUrl: 'https://example.com/artifact.txt',
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result).toEqual({
        content: httpContent,
        contentType: 'text/plain',
        size: Buffer.byteLength(httpContent, 'utf8'),
        source: 'url',
        metadata: {
          statusCode: 200,
          headers: {
            'content-type': 'text/plain',
            'content-length': httpContent.length.toString(),
          },
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/artifact.txt',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'User-Agent': 'AI-Agent-System/1.0',
          },
        })
      );
    });

    it('should handle HTTP errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const event = {
        artifactUrl: 'https://example.com/not-found.txt',
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const event = {
        artifactUrl: 'https://example.com/artifact.txt',
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow('Network error');
    });

    it('should handle missing content-type header', async () => {
      const httpContent = 'Content without type';
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(httpContent),
        headers: new Map(),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const event = {
        artifactUrl: 'https://example.com/artifact',
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result.contentType).toBe('text/plain');
    });
  });

  describe('validation', () => {
    it('should reject when neither content nor URL is provided', async () => {
      const event = {
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow(
        'Either artifactUrl or artifactContent must be provided'
      );
    });

    it('should reject artifacts that are too large', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const event = {
        artifactContent: largeContent,
        jobId: 'test-job-123',
      };

      await expect(handler(event)).rejects.toThrow(
        'Artifact size (11534336 bytes) exceeds maximum allowed size (10485760 bytes)'
      );
    });

    it('should accept artifacts at the size limit', async () => {
      const maxContent = 'x'.repeat(10 * 1024 * 1024); // Exactly 10MB
      const event = {
        artifactContent: maxContent,
        jobId: 'test-job-123',
      };

      const result = await handler(event);

      expect(result.size).toBe(10 * 1024 * 1024);
      expect(result.content).toBe(maxContent);
    });
  });

  describe('URL parsing', () => {
    it('should parse S3 URLs correctly', async () => {
      const s3Content = 'test content';
      const mockResponse = {
        Body: {
          transformToString: jest.fn().mockResolvedValue(s3Content),
        },
        ContentType: 'text/plain',
        ContentLength: s3Content.length,
      };

      s3Mock.on(GetObjectCommand).resolves(mockResponse);

      const event = {
        artifactUrl: 's3://my-bucket/path/to/file.txt',
        jobId: 'test-job-123',
      };

      await handler(event);

      expect(s3Mock.call(0).args[0].input).toEqual({
        Bucket: 'my-bucket',
        Key: 'path/to/file.txt',
      });
    });

    it('should handle S3 URLs with special characters', async () => {
      const s3Content = 'test content';
      const mockResponse = {
        Body: {
          transformToString: jest.fn().mockResolvedValue(s3Content),
        },
        ContentType: 'text/plain',
        ContentLength: s3Content.length,
      };

      s3Mock.on(GetObjectCommand).resolves(mockResponse);

      const event = {
        artifactUrl: 's3://my-bucket/path%20with%20spaces/file-name.txt',
        jobId: 'test-job-123',
      };

      await handler(event);

      expect(s3Mock.call(0).args[0].input).toEqual({
        Bucket: 'my-bucket',
        Key: 'path%20with%20spaces/file-name.txt',
      });
    });
  });
});