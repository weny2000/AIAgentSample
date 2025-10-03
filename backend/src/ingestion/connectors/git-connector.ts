/**
 * Git connector for ingesting repository content and commit history
 * Supports GitHub, GitLab, Bitbucket with various authentication methods
 */

import { BaseConnector, ConnectorCredentials, SyncOptions, ConnectorMetrics } from './base-connector.js';
import { Document, ConnectorConfig } from '../types.js';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface GitCredentials extends ConnectorCredentials {
  // For API access
  access_token?: string;
  username?: string;
  password?: string;
  
  // For SSH access
  ssh_private_key?: string;
  ssh_public_key?: string;
  ssh_passphrase?: string;
  
  // For GitHub App
  app_id?: string;
  private_key?: string;
  installation_id?: string;
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

interface GitCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  files?: GitFile[];
}

interface GitFile {
  filename: string;
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  content?: string;
}

interface GitProvider {
  name: 'github' | 'gitlab' | 'bitbucket';
  api_url: string;
  clone_url_template: string;
}

export class GitConnector extends BaseConnector {
  private client: AxiosInstance;
  protected credentials: GitCredentials;
  private provider: GitProvider;
  private tempDir: string;
  private lastSyncTime: Date | null = null;
  private metrics: ConnectorMetrics = {
    documentsProcessed: 0,
    documentsSkipped: 0,
    errors: 0,
    lastSyncTime: new Date(),
    avgProcessingTime: 0,
  };

  constructor(config: ConnectorConfig) {
    super(config);
    this.credentials = config.credentials as GitCredentials;
    this.provider = this.detectProvider(config);
    this.tempDir = path.join(os.tmpdir(), `git-connector-${Date.now()}`);
    
    this.client = axios.create({
      baseURL: this.provider.api_url,
      timeout: 30000,
    });

    this.setupAuthentication();
  }

  private detectProvider(config: ConnectorConfig): GitProvider {
    const baseUrl = config.credentials.base_url || 'https://api.github.com';
    
    if (baseUrl.includes('github')) {
      return {
        name: 'github',
        api_url: baseUrl,
        clone_url_template: 'https://github.com/{owner}/{repo}.git',
      };
    } else if (baseUrl.includes('gitlab')) {
      return {
        name: 'gitlab',
        api_url: baseUrl,
        clone_url_template: 'https://gitlab.com/{owner}/{repo}.git',
      };
    } else if (baseUrl.includes('bitbucket')) {
      return {
        name: 'bitbucket',
        api_url: baseUrl,
        clone_url_template: 'https://bitbucket.org/{owner}/{repo}.git',
      };
    } else {
      // Default to GitHub
      return {
        name: 'github',
        api_url: 'https://api.github.com',
        clone_url_template: 'https://github.com/{owner}/{repo}.git',
      };
    }
  }

  private setupAuthentication(): void {
    if (this.credentials.access_token) {
      // Token-based authentication
      this.client.defaults.headers.common['Authorization'] = 
        `Bearer ${this.credentials.access_token}`;
    } else if (this.credentials.username && this.credentials.password) {
      // Basic authentication
      const auth = Buffer.from(
        `${this.credentials.username}:${this.credentials.password}`
      ).toString('base64');
      this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
    }

    // Add rate limiting interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          await this.handleRateLimit(retryAfter);
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      let endpoint = '/user';
      if (this.provider.name === 'gitlab') {
        endpoint = '/user';
      } else if (this.provider.name === 'bitbucket') {
        endpoint = '/user';
      }

      const response = await this.client.get(endpoint);
      return response.status === 200;
    } catch (error) {
      this.log('error', 'Connection test failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      const isConnected = await this.testConnection();
      if (isConnected) {
        this.log('info', 'Authentication successful', { provider: this.provider.name });
        return true;
      }
      return false;
    } catch (error) {
      this.log('error', 'Authentication failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  async fetchDocuments(options: SyncOptions = {}): Promise<Document[]> {
    const startTime = Date.now();
    const documents: Document[] = [];

    try {
      // Get repositories
      const repositories = await this.getRepositories(options);
      
      for (const repo of repositories) {
        try {
          // Fetch repository content documents
          const repoDocs = await this.fetchRepositoryDocuments(repo, options);
          
          // Fetch commit history documents
          const commitDocs = await this.fetchCommitDocuments(repo, options);
          
          const allDocs = [...repoDocs, ...commitDocs];
          
          // Apply team boundary validation
          const validDocs = allDocs.filter(doc => this.validateTeamBoundaries(doc));
          documents.push(...validDocs);
          
          this.metrics.documentsProcessed += validDocs.length;
          this.metrics.documentsSkipped += allDocs.length - validDocs.length;
          
        } catch (error) {
          this.log('error', `Error processing repository ${repo.full_name}`, { 
            error: error instanceof Error ? error.message : String(error),
            repository: repo.full_name 
          });
          this.metrics.errors++;
        }
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.avgProcessingTime = 
        (this.metrics.avgProcessingTime + processingTime) / 2;
      this.metrics.lastSyncTime = new Date();

      this.log('info', 'Document fetch completed', {
        documentsProcessed: this.metrics.documentsProcessed,
        documentsSkipped: this.metrics.documentsSkipped,
        errors: this.metrics.errors,
        processingTime,
      });

      return documents;

    } catch (error) {
      this.log('error', 'Failed to fetch documents', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.metrics.errors++;
      throw error;
    }
  }

  async fetchDocument(id: string): Promise<Document | null> {
    try {
      // Parse document ID (format: repo_id:type:identifier)
      const [repoId, docType, identifier] = id.split(':');
      if (!repoId || !docType || !identifier) {
        throw new Error('Invalid document ID format');
      }

      const repo = await this.getRepository(repoId);
      if (!repo) {
        return null;
      }

      if (docType === 'file') {
        return this.fetchFileDocument(repo, identifier);
      } else if (docType === 'commit') {
        return this.fetchCommitDocument(repo, identifier);
      }

      return null;

    } catch (error) {
      this.log('error', 'Failed to fetch single document', { 
        error: error instanceof Error ? error.message : String(error),
        documentId: id 
      });
      return null;
    }
  }

  async getLastSyncTime(): Promise<Date | null> {
    return this.lastSyncTime;
  }

  async updateLastSyncTime(timestamp: Date): Promise<void> {
    this.lastSyncTime = timestamp;
  }

  async getMetrics(): Promise<ConnectorMetrics> {
    return { ...this.metrics };
  }

  async reset(): Promise<void> {
    this.lastSyncTime = null;
    this.metrics = {
      documentsProcessed: 0,
      documentsSkipped: 0,
      errors: 0,
      lastSyncTime: new Date(),
      avgProcessingTime: 0,
    };

    // Clean up temp directory
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get repositories accessible to the authenticated user
   */
  private async getRepositories(options: SyncOptions): Promise<GitRepository[]> {
    const repositories: GitRepository[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        let endpoint = '/user/repos';
        let params: any = {
          page,
          per_page: perPage,
          sort: 'updated',
          direction: 'desc',
        };

        if (this.provider.name === 'gitlab') {
          endpoint = '/projects';
          params = {
            page,
            per_page: perPage,
            order_by: 'last_activity_at',
            sort: 'desc',
            membership: true,
          };
        } else if (this.provider.name === 'bitbucket') {
          endpoint = '/repositories';
          params = {
            page,
            pagelen: perPage,
          };
        }

        const response = await this.client.get(endpoint, { params });
        
        if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) {
          break;
        }

        const repos = Array.isArray(response.data) ? response.data : response.data.values || [];
        
        for (const repo of repos) {
          const gitRepo = this.normalizeRepository(repo);
          
          // Apply team filtering if specified
          if (options.teamIds && !options.teamIds.includes(gitRepo.owner)) {
            continue;
          }

          repositories.push(gitRepo);
        }

        if (repos.length < perPage) {
          break;
        }

        page++;
      }

    } catch (error) {
      this.log('error', 'Failed to fetch repositories', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }

    return repositories;
  }

  /**
   * Get a specific repository by ID
   */
  private async getRepository(repoId: string): Promise<GitRepository | null> {
    try {
      let endpoint = `/repos/${repoId}`;
      
      if (this.provider.name === 'gitlab') {
        endpoint = `/projects/${encodeURIComponent(repoId)}`;
      } else if (this.provider.name === 'bitbucket') {
        endpoint = `/repositories/${repoId}`;
      }

      const response = await this.client.get(endpoint);
      return this.normalizeRepository(response.data);

    } catch (error) {
      this.log('warn', 'Failed to get repository', { 
        error: error instanceof Error ? error.message : String(error),
        repoId 
      });
      return null;
    }
  }

  /**
   * Normalize repository data across different providers
   */
  private normalizeRepository(repo: any): GitRepository {
    if (this.provider.name === 'github') {
      return {
        id: repo.id.toString(),
        name: repo.name,
        full_name: repo.full_name,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        default_branch: repo.default_branch || 'main',
        private: repo.private,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language,
        topics: repo.topics || [],
      };
    } else if (this.provider.name === 'gitlab') {
      return {
        id: repo.id.toString(),
        name: repo.name,
        full_name: repo.path_with_namespace,
        clone_url: repo.http_url_to_repo,
        ssh_url: repo.ssh_url_to_repo,
        default_branch: repo.default_branch || 'main',
        private: repo.visibility === 'private',
        owner: repo.namespace.path,
        description: repo.description,
        topics: repo.tag_list || [],
      };
    } else if (this.provider.name === 'bitbucket') {
      return {
        id: repo.uuid,
        name: repo.name,
        full_name: repo.full_name,
        clone_url: repo.links.clone.find((l: any) => l.name === 'https')?.href || '',
        ssh_url: repo.links.clone.find((l: any) => l.name === 'ssh')?.href || '',
        default_branch: repo.mainbranch?.name || 'main',
        private: repo.is_private,
        owner: repo.owner.username,
        description: repo.description,
        language: repo.language,
      };
    }

    throw new Error(`Unsupported provider: ${this.provider.name}`);
  }

  /**
   * Fetch repository content documents (README, documentation files, etc.)
   */
  private async fetchRepositoryDocuments(
    repo: GitRepository, 
    options: SyncOptions
  ): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      // Get repository tree to find important files
      const tree = await this.getRepositoryTree(repo);
      
      // Filter for documentation and configuration files
      const importantFiles = tree.filter(file => 
        this.isImportantFile(file.path) && file.type === 'blob'
      );

      for (const file of importantFiles) {
        try {
          const content = await this.getFileContent(repo, file.path);
          if (content) {
            const document = this.createFileDocument(repo, file, content);
            documents.push(this.applyAccessControls(document));
          }
        } catch (error) {
          this.log('warn', 'Failed to fetch file content', {
            error: error instanceof Error ? error.message : String(error),
            repository: repo.full_name,
            file: file.path,
          });
        }
      }

    } catch (error) {
      this.log('error', 'Failed to fetch repository documents', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
      });
    }

    return documents;
  }

  /**
   * Fetch commit history documents
   */
  private async fetchCommitDocuments(
    repo: GitRepository, 
    _options: SyncOptions
  ): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      const commits = await this.getCommits(repo, _options);
      
      for (const commit of commits) {
        const document = this.createCommitDocument(repo, commit);
        documents.push(this.applyAccessControls(document));
      }

    } catch (error) {
      this.log('error', 'Failed to fetch commit documents', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
      });
    }

    return documents;
  }

  /**
   * Get repository tree (file structure)
   */
  private async getRepositoryTree(repo: GitRepository): Promise<any[]> {
    try {
      let endpoint = `/repos/${repo.full_name}/git/trees/${repo.default_branch}`;
      
      if (this.provider.name === 'gitlab') {
        endpoint = `/projects/${encodeURIComponent(repo.full_name)}/repository/tree`;
      } else if (this.provider.name === 'bitbucket') {
        endpoint = `/repositories/${repo.full_name}/src/${repo.default_branch}`;
      }

      const response = await this.client.get(endpoint, {
        params: { recursive: 1 }
      });

      if (this.provider.name === 'github') {
        return response.data.tree || [];
      } else if (this.provider.name === 'gitlab') {
        return response.data || [];
      } else if (this.provider.name === 'bitbucket') {
        return response.data.values || [];
      }

      return [];

    } catch (error) {
      this.log('warn', 'Failed to get repository tree', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
      });
      return [];
    }
  }

  /**
   * Get file content from repository
   */
  private async getFileContent(repo: GitRepository, filePath: string): Promise<string | null> {
    try {
      let endpoint = `/repos/${repo.full_name}/contents/${filePath}`;
      
      if (this.provider.name === 'gitlab') {
        endpoint = `/projects/${encodeURIComponent(repo.full_name)}/repository/files/${encodeURIComponent(filePath)}/raw`;
      } else if (this.provider.name === 'bitbucket') {
        endpoint = `/repositories/${repo.full_name}/src/${repo.default_branch}/${filePath}`;
      }

      const response = await this.client.get(endpoint);

      if (this.provider.name === 'github') {
        // GitHub returns base64 encoded content
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      } else {
        // GitLab and Bitbucket return raw content
        return response.data;
      }

    } catch (error) {
      this.log('warn', 'Failed to get file content', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
        file: filePath,
      });
      return null;
    }
  }

  /**
   * Get commit history
   */
  private async getCommits(repo: GitRepository, options: SyncOptions): Promise<GitCommit[]> {
    const commits: GitCommit[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (commits.length < (options.limit || 1000)) {
        let endpoint = `/repos/${repo.full_name}/commits`;
        let params: any = {
          page,
          per_page: perPage,
          sha: repo.default_branch,
        };

        if (options.since) {
          params.since = options.since.toISOString();
        }

        if (this.provider.name === 'gitlab') {
          endpoint = `/projects/${encodeURIComponent(repo.full_name)}/repository/commits`;
          params = {
            page,
            per_page: perPage,
            ref_name: repo.default_branch,
          };
          if (options.since) {
            params.since = options.since.toISOString();
          }
        } else if (this.provider.name === 'bitbucket') {
          endpoint = `/repositories/${repo.full_name}/commits/${repo.default_branch}`;
          params = {
            page,
            pagelen: perPage,
          };
        }

        const response = await this.client.get(endpoint, { params });
        
        const commitData = Array.isArray(response.data) ? response.data : response.data.values || [];
        
        if (commitData.length === 0) {
          break;
        }

        for (const commit of commitData) {
          commits.push(this.normalizeCommit(commit));
        }

        if (commitData.length < perPage) {
          break;
        }

        page++;
      }

    } catch (error) {
      this.log('error', 'Failed to fetch commits', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
      });
    }

    return commits;
  }

  /**
   * Normalize commit data across different providers
   */
  private normalizeCommit(commit: any): GitCommit {
    if (this.provider.name === 'github') {
      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: commit.commit.committer.date,
        },
      };
    } else if (this.provider.name === 'gitlab') {
      return {
        sha: commit.id,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
          date: commit.authored_date,
        },
        committer: {
          name: commit.committer_name,
          email: commit.committer_email,
          date: commit.committed_date,
        },
      };
    } else if (this.provider.name === 'bitbucket') {
      return {
        sha: commit.hash,
        message: commit.message,
        author: {
          name: commit.author.user?.display_name || commit.author.raw,
          email: commit.author.user?.email || '',
          date: commit.date,
        },
        committer: {
          name: commit.author.user?.display_name || commit.author.raw,
          email: commit.author.user?.email || '',
          date: commit.date,
        },
      };
    }

    throw new Error(`Unsupported provider: ${this.provider.name}`);
  }

  /**
   * Check if a file is important for documentation purposes
   */
  private isImportantFile(filePath: string): boolean {
    const importantPatterns = [
      /^README\.(md|txt|rst)$/i,
      /^CHANGELOG\.(md|txt|rst)$/i,
      /^CONTRIBUTING\.(md|txt|rst)$/i,
      /^LICENSE$/i,
      /^\.gitignore$/,
      /^package\.json$/,
      /^requirements\.txt$/,
      /^Dockerfile$/,
      /^docker-compose\.ya?ml$/,
      /\.md$/i,
      /docs?\//i,
    ];

    return importantPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Create document from file content
   */
  private createFileDocument(repo: GitRepository, file: any, content: string): Document {
    return {
      id: `${repo.id}:file:${file.path}`,
      source_type: 'git',
      source_id: file.sha || file.id,
      team_id: repo.owner,
      content,
      metadata: {
        title: path.basename(file.path),
        author: repo.owner,
        repository: repo.full_name,
        file_path: file.path,
        tags: [
          'file',
          repo.language || 'unknown',
          ...repo.topics || [],
        ],
        language: repo.language,
        content_type: this.getContentType(file.path),
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generateAccessControls(repo),
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Create document from commit
   */
  private createCommitDocument(repo: GitRepository, commit: GitCommit): Document {
    const content = `Commit: ${commit.sha}
Message: ${commit.message}
Author: ${commit.author.name} <${commit.author.email}>
Date: ${commit.author.date}

${commit.message}`;

    return {
      id: `${repo.id}:commit:${commit.sha}`,
      source_type: 'git',
      source_id: commit.sha,
      team_id: repo.owner,
      content,
      metadata: {
        title: `Commit ${commit.sha.substring(0, 8)}`,
        author: commit.author.name,
        repository: repo.full_name,
        tags: [
          'commit',
          repo.language || 'unknown',
          ...repo.topics || [],
        ],
        language: repo.language,
        content_type: 'text/plain',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        checksum: crypto.createHash('md5').update(content).digest('hex'),
      },
      access_controls: this.generateAccessControls(repo),
      created_at: new Date(commit.author.date),
      updated_at: new Date(commit.committer.date),
    };
  }

  /**
   * Fetch a specific file document
   */
  private async fetchFileDocument(repo: GitRepository, filePath: string): Promise<Document | null> {
    const content = await this.getFileContent(repo, filePath);
    if (!content) {
      return null;
    }

    const file = { path: filePath, sha: 'unknown' };
    return this.applyAccessControls(this.createFileDocument(repo, file, content));
  }

  /**
   * Fetch a specific commit document
   */
  private async fetchCommitDocument(repo: GitRepository, sha: string): Promise<Document | null> {
    try {
      let endpoint = `/repos/${repo.full_name}/commits/${sha}`;
      
      if (this.provider.name === 'gitlab') {
        endpoint = `/projects/${encodeURIComponent(repo.full_name)}/repository/commits/${sha}`;
      } else if (this.provider.name === 'bitbucket') {
        endpoint = `/repositories/${repo.full_name}/commit/${sha}`;
      }

      const response = await this.client.get(endpoint);
      const commit = this.normalizeCommit(response.data);
      
      return this.applyAccessControls(this.createCommitDocument(repo, commit));

    } catch (error) {
      this.log('warn', 'Failed to fetch commit document', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
        sha,
      });
      return null;
    }
  }

  /**
   * Generate access controls based on repository visibility
   */
  private generateAccessControls(repo: GitRepository): any[] {
    const controls = [];

    if (repo.private) {
      controls.push({
        type: 'team',
        identifier: repo.owner,
        permission: 'read',
      });
    } else {
      controls.push({
        type: 'team',
        identifier: 'public',
        permission: 'read',
      });
    }

    return controls;
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const contentTypes: Record<string, string> = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'text/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
    };

    return contentTypes[ext] || 'text/plain';
  }

  /**
   * Setup SSH key for Git operations (if using SSH authentication)
   */
  private async setupSSHKey(): Promise<string | null> {
    if (!this.credentials.ssh_private_key) {
      return null;
    }

    try {
      const sshDir = path.join(this.tempDir, '.ssh');
      fs.mkdirSync(sshDir, { recursive: true });
      
      const keyPath = path.join(sshDir, 'id_rsa');
      fs.writeFileSync(keyPath, this.credentials.ssh_private_key, { mode: 0o600 });
      
      if (this.credentials.ssh_public_key) {
        fs.writeFileSync(`${keyPath}.pub`, this.credentials.ssh_public_key);
      }

      return keyPath;

    } catch (error) {
      this.log('error', 'Failed to setup SSH key', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Clone repository using Git CLI (for advanced operations)
   * Currently unused but kept for future enhancements
   */
  private async _cloneRepository(repo: GitRepository): Promise<string | null> {
    try {
      const repoDir = path.join(this.tempDir, repo.name);
      
      let cloneUrl = repo.clone_url;
      let gitEnv: Record<string, string> = {};

      // Setup authentication for cloning
      if (this.credentials.ssh_private_key) {
        const sshKeyPath = await this.setupSSHKey();
        if (sshKeyPath) {
          cloneUrl = repo.ssh_url;
          gitEnv.GIT_SSH_COMMAND = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`;
        }
      } else if (this.credentials.access_token) {
        // Use token in clone URL
        const url = new URL(cloneUrl);
        url.username = this.credentials.access_token;
        cloneUrl = url.toString();
      }

      // Clone the repository
      execSync(`git clone ${cloneUrl} ${repoDir}`, {
        env: { ...process.env, ...gitEnv },
        stdio: 'pipe',
      });

      return repoDir;

    } catch (error) {
      this.log('error', 'Failed to clone repository', {
        error: error instanceof Error ? error.message : String(error),
        repository: repo.full_name,
      });
      return null;
    }
  }
}