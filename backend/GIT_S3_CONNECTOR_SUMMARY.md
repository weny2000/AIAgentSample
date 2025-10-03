# Git and S3 Connectors Implementation Summary

## Overview

This document summarizes the implementation of Git and S3 connectors for the AI Agent system's data ingestion pipeline. These connectors enable the system to ingest content from Git repositories (GitHub, GitLab, Bitbucket) and S3 buckets with support for various authentication methods and cross-account access patterns.

## Git Connector Features

### Supported Providers
- **GitHub**: Full API support with token authentication
- **GitLab**: API support for both GitLab.com and self-hosted instances
- **Bitbucket**: API support for Bitbucket Cloud

### Authentication Methods
1. **Personal Access Tokens**: Most common method for API access
2. **Basic Authentication**: Username/password for legacy systems
3. **SSH Keys**: For Git clone operations (planned)
4. **GitHub Apps**: For enterprise installations (planned)

### Data Sources
- **Repository Metadata**: Basic repository information, topics, languages
- **File Content**: Important files like README, documentation, configuration
- **Commit History**: Commit messages, authors, timestamps, and changes
- **Branch Information**: Default branch detection and multi-branch support (planned)

### Key Features
- **Provider Detection**: Automatically detects Git provider from base URL
- **Rate Limiting**: Handles API rate limits with exponential backoff
- **Team Boundaries**: Filters repositories by owner/organization
- **Content Filtering**: Focuses on documentation and configuration files
- **Incremental Sync**: Supports since-date filtering for efficient updates

## S3 Connector Features

### Authentication Methods
1. **IAM Credentials**: Access key ID and secret access key
2. **IAM Roles**: Role-based access with temporary credentials
3. **Cross-Account Access**: Assume roles in different AWS accounts
4. **AWS Profiles**: Use configured AWS CLI profiles
5. **Instance Profiles**: For EC2/ECS deployments

### Access Patterns
- **Single Account**: Standard S3 bucket access within same account
- **Cross-Account**: Access buckets in different AWS accounts via role assumption
- **Prefix-Based**: Filter objects by S3 key prefixes
- **Pattern Matching**: Include/exclude files based on glob patterns

### Key Features
- **Content Type Detection**: Automatic MIME type detection based on file extensions
- **Large File Handling**: Skips files over 100MB to prevent memory issues
- **Metadata Extraction**: Uses S3 object metadata for team boundaries and access controls
- **Real-time Updates**: Supports S3 event notifications for live updates
- **Team Extraction**: Intelligent team ID extraction from object paths and metadata

## Implementation Details

### Git Connector Architecture

```typescript
interface GitCredentials {
  access_token?: string;        // API token
  username?: string;           // Basic auth username
  password?: string;           // Basic auth password
  ssh_private_key?: string;    // SSH private key
  ssh_public_key?: string;     // SSH public key
  ssh_passphrase?: string;     // SSH key passphrase
}

interface GitRepository {
  id: string;
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  private: boolean;
  owner: string;
  description?: string;
  language?: string;
  topics?: string[];
}
```

### S3 Connector Architecture

```typescript
interface S3Credentials {
  access_key_id?: string;
  secret_access_key?: string;
  session_token?: string;
  region?: string;
  role_arn?: string;
  external_id?: string;
  profile?: string;
}

interface S3BucketConfig {
  bucket_name: string;
  prefix?: string;
  include_patterns?: string[];
  exclude_patterns?: string[];
  cross_account_role_arn?: string;
  kms_key_id?: string;
}
```

## Configuration Examples

### GitHub Configuration
```json
{
  "source_type": "git",
  "credentials": {
    "base_url": "https://api.github.com",
    "access_token": "ghp_xxxxxxxxxxxxxxxxxxxx"
  },
  "sync_interval": 3600,
  "team_boundaries": ["my-org"],
  "access_controls": [],
  "enabled": true
}
```

### GitLab Configuration
```json
{
  "source_type": "git",
  "credentials": {
    "base_url": "https://gitlab.com/api/v4",
    "access_token": "glpat-xxxxxxxxxxxxxxxxxxxx"
  },
  "sync_interval": 3600,
  "team_boundaries": ["my-group"],
  "access_controls": [],
  "enabled": true
}
```

### S3 Configuration
```json
{
  "source_type": "s3",
  "credentials": {
    "bucket_name": "my-documents-bucket",
    "region": "us-east-1",
    "prefix": "team-docs/",
    "include_patterns": ["*.md", "*.txt", "*.json"],
    "exclude_patterns": ["*.tmp", "*.log"]
  },
  "sync_interval": 1800,
  "team_boundaries": ["team-alpha"],
  "access_controls": [],
  "enabled": true
}
```

### S3 Cross-Account Configuration
```json
{
  "source_type": "s3",
  "credentials": {
    "bucket_name": "cross-account-bucket",
    "region": "us-west-2",
    "cross_account_role_arn": "arn:aws:iam::123456789012:role/CrossAccountRole",
    "external_id": "unique-external-id"
  },
  "sync_interval": 3600,
  "team_boundaries": [],
  "access_controls": [],
  "enabled": true
}
```

## Document Structure

### Git Documents
```typescript
{
  id: "repo_id:type:identifier",  // e.g., "123:file:README.md"
  source_type: "git",
  source_id: "commit_sha_or_file_sha",
  team_id: "repository_owner",
  content: "file_content_or_commit_message",
  metadata: {
    title: "filename_or_commit_title",
    author: "author_name",
    repository: "owner/repo_name",
    file_path: "path/to/file",
    tags: ["file", "language", "topics"],
    language: "programming_language",
    content_type: "text/markdown",
    size_bytes: 1234,
    checksum: "md5_hash"
  },
  access_controls: [
    {
      type: "team",
      identifier: "repository_owner",
      permission: "read"
    }
  ],
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z"
}
```

### S3 Documents
```typescript
{
  id: "s3_object_key",
  source_type: "s3",
  source_id: "etag",
  team_id: "extracted_team_id",
  content: "object_content",
  metadata: {
    title: "filename",
    file_path: "full/s3/key",
    tags: ["extension", "storage:class", "dir:folder"],
    content_type: "text/plain",
    size_bytes: 5678,
    checksum: "etag"
  },
  access_controls: [
    {
      type: "team",
      identifier: "team_id",
      permission: "read"
    }
  ],
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z"
}
```

## Error Handling

### Git Connector Errors
- **Authentication Failures**: Invalid tokens, expired credentials
- **Rate Limiting**: API quota exceeded, retry with backoff
- **Repository Access**: Private repos, insufficient permissions
- **Network Issues**: Timeouts, connection failures
- **Content Errors**: Large files, binary content, encoding issues

### S3 Connector Errors
- **Access Denied**: Insufficient IAM permissions, bucket policies
- **Cross-Account Issues**: Role assumption failures, trust policies
- **Object Errors**: Large objects, corrupted content, encryption
- **Network Issues**: Regional connectivity, VPC endpoints
- **Configuration Errors**: Invalid bucket names, missing regions

## Performance Considerations

### Git Connector
- **API Rate Limits**: GitHub (5000/hour), GitLab (varies), Bitbucket (1000/hour)
- **Pagination**: Handles large repository lists and commit histories
- **Content Filtering**: Only processes important files to reduce load
- **Caching**: Implements ETag-based caching for unchanged content

### S3 Connector
- **Object Listing**: Uses pagination for buckets with many objects
- **Content Size**: Skips objects larger than 100MB
- **Parallel Processing**: Can process multiple objects concurrently
- **Streaming**: Uses streaming for large object content

## Security Features

### Git Connector Security
- **Token Management**: Secure storage of access tokens
- **SSH Key Handling**: Temporary key files with proper permissions
- **HTTPS Only**: All API calls use encrypted connections
- **Access Validation**: Respects repository visibility settings

### S3 Connector Security
- **IAM Integration**: Uses AWS IAM for access control
- **Encryption**: Supports KMS-encrypted objects
- **Cross-Account**: Secure role assumption with external IDs
- **VPC Endpoints**: Supports private network access

## Testing

### Test Coverage
- **Unit Tests**: Individual connector methods and error handling
- **Integration Tests**: Real API calls with test credentials
- **Mock Tests**: Simulated responses for CI/CD pipelines
- **Performance Tests**: Large repository and bucket handling

### Test Commands
```bash
# Run all connector tests
npm run test:git-s3

# Run specific tests
npm run test -- --testNamePattern="Git"
npm run test -- --testNamePattern="S3"
```

## Monitoring and Metrics

### Available Metrics
- **Documents Processed**: Total number of documents ingested
- **Documents Skipped**: Files/objects that were filtered out
- **Errors**: Count of processing errors by type
- **Processing Time**: Average time per document
- **Last Sync Time**: Timestamp of last successful sync

### Logging
- **Structured Logging**: JSON format with correlation IDs
- **Error Details**: Full error context for debugging
- **Performance Metrics**: Processing times and throughput
- **Security Events**: Authentication and authorization events

## Future Enhancements

### Git Connector
- **Multi-Branch Support**: Ingest from multiple branches
- **Pull Request Integration**: Include PR discussions and reviews
- **Webhook Support**: Real-time updates via Git webhooks
- **Advanced Filtering**: File type and size-based filtering
- **Git LFS Support**: Handle large file storage objects

### S3 Connector
- **Intelligent Parsing**: Extract text from PDFs, Office docs
- **Version Support**: Handle S3 object versioning
- **Lifecycle Integration**: Respect S3 lifecycle policies
- **CloudTrail Integration**: Track access patterns
- **Multi-Region Support**: Cross-region bucket access

## Troubleshooting

### Common Issues

1. **Git Authentication Failures**
   - Verify token permissions and expiration
   - Check API rate limits and quotas
   - Ensure base URL is correct for provider

2. **S3 Access Issues**
   - Verify IAM permissions for bucket operations
   - Check bucket policies and ACLs
   - Ensure region configuration is correct

3. **Performance Problems**
   - Monitor API rate limits and adjust sync intervals
   - Use prefix filtering to reduce object scanning
   - Implement incremental sync with since dates

4. **Content Processing Errors**
   - Check file size limits and encoding
   - Verify content type detection
   - Monitor memory usage for large files

### Debug Commands
```bash
# Enable debug logging
export DEBUG=git-connector,s3-connector

# Test specific connector
npm run test:git-s3 -- --verbose

# Check connector registration
node -e "import('./src/ingestion/connectors/base-connector.js').then(m => console.log(m.ConnectorFactory.getSupportedTypes()))"
```

This implementation provides a robust foundation for ingesting content from Git repositories and S3 buckets, with comprehensive error handling, security features, and performance optimizations.