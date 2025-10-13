import { useAuthStore } from '../stores/authStore';
import { env } from './env';

const API_BASE_URL = env.VITE_API_BASE_URL;

class ApiClient {
  private baseURL: string;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const { token } = useAuthStore.getState();
    
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Handle 401 Unauthorized - token might be expired
      if (response.status === 401 && token && retryCount === 0) {
        return this.handleUnauthorized(endpoint, options);
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle specific error cases
        if (response.status === 403) {
          throw new Error('Access denied. You do not have permission to perform this action.');
        }
        
        if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  private async handleUnauthorized<T>(
    endpoint: string,
    options: RequestInit
  ): Promise<T> {
    const { refreshTokens, handleSessionExpired } = useAuthStore.getState();

    if (this.isRefreshing) {
      // If already refreshing, queue this request
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      await refreshTokens();
      
      // Process queued requests
      this.failedQueue.forEach(({ resolve }) => {
        resolve(this.request(endpoint, options, 1));
      });
      this.failedQueue = [];
      
      // Retry original request
      return this.request(endpoint, options, 1);
    } catch (error) {
      // Refresh failed, reject all queued requests
      this.failedQueue.forEach(({ reject }) => {
        reject(error);
      });
      this.failedQueue = [];
      
      // Handle session expiry
      handleSessionExpired();
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // File upload method
  async uploadFile<T>(endpoint: string, file: File, additionalData?: Record<string, any>): Promise<T> {
    const { token } = useAuthStore.getState();
    
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// API endpoint functions for use with TanStack Query
export const api = {
  // Agent operations (legacy)
  checkArtifact: (data: { file: File; type: string }) =>
    apiClient.uploadFile('/agent/check', data.file, { type: data.type }),
  
  getCheckStatus: (jobId: string) =>
    apiClient.get(`/agent/status/${jobId}`),
  
  queryAgent: (data: { query: string; context?: string }) =>
    apiClient.post('/agent/query', data),

  // AgentCore operations
  startAgentSession: (data: {
    userId: string;
    teamId: string;
    personaId?: string;
    initialMessage?: string;
    context?: Record<string, any>;
  }) =>
    apiClient.post('/agent/sessions', data),

  sendAgentMessage: (sessionId: string, data: {
    message: string;
    messageType?: 'text' | 'command' | 'file_upload';
  }) =>
    apiClient.post(`/agent/sessions/${sessionId}/messages`, data),

  getAgentSessionHistory: (sessionId: string, params?: {
    limit?: number;
    offset?: number;
    includeReferences?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    if (params?.includeReferences) queryParams.set('includeReferences', 'true');
    
    const query = queryParams.toString();
    return apiClient.get(`/agent/sessions/${sessionId}/history${query ? `?${query}` : ''}`);
  },

  endAgentSession: (sessionId: string) =>
    apiClient.delete(`/agent/sessions/${sessionId}`),

  getAgentCapabilities: (params?: {
    category?: string;
    enabled?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.set('category', params.category);
    if (params?.enabled !== undefined) queryParams.set('enabled', params.enabled.toString());
    
    const query = queryParams.toString();
    return apiClient.get(`/agent/capabilities${query ? `?${query}` : ''}`);
  },

  getAgentMetadata: () =>
    apiClient.get('/agent/metadata'),

  getAgentHealth: (detailed?: boolean) =>
    apiClient.get(`/agent/health${detailed ? '/detailed' : ''}`),

  getAgentStatus: (params?: {
    includeMetrics?: boolean;
    includeIssues?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.includeMetrics) queryParams.set('includeMetrics', 'true');
    if (params?.includeIssues) queryParams.set('includeIssues', 'true');
    
    const query = queryParams.toString();
    return apiClient.get(`/agent/status${query ? `?${query}` : ''}`);
  },

  getAgentConfiguration: (agentId: string) =>
    apiClient.get(`/agent/agents/${agentId}/config`),

  updateAgentConfiguration: (agentId: string, data: {
    settings?: Record<string, any>;
    constraints?: Record<string, any>;
    capabilities?: string[];
  }) =>
    apiClient.put(`/agent/agents/${agentId}/config`, data),

  getAgentAnalytics: (params?: {
    startDate?: string;
    endDate?: string;
    metrics?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    if (params?.metrics) queryParams.set('metrics', params.metrics);
    
    const query = queryParams.toString();
    return apiClient.get(`/agent/analytics${query ? `?${query}` : ''}`);
  },

  // Knowledge base
  search: (data: { query: string; filters?: Record<string, any> }) =>
    apiClient.post('/kendra/search', data),

  // Admin operations
  getPersonas: () =>
    apiClient.get('/admin/personas'),
  
  createPersona: (data: any) =>
    apiClient.post('/admin/persona', data),
  
  updatePersona: (id: string, data: any) =>
    apiClient.put(`/admin/persona/${id}`, data),

  deletePersona: (id: string) =>
    apiClient.delete(`/admin/persona/${id}`),

  getPolicies: () =>
    apiClient.get('/admin/policies'),
  
  createPolicy: (data: any) =>
    apiClient.post('/admin/policy', data),

  updatePolicy: (id: string, data: any) =>
    apiClient.put(`/admin/policy/${id}`, data),

  deletePolicy: (id: string) =>
    apiClient.delete(`/admin/policy/${id}`),

  // User management
  getUsers: () =>
    apiClient.get('/admin/users'),

  updateUser: (id: string, data: any) =>
    apiClient.put(`/admin/user/${id}`, data),

  // Audit logs
  getAuditLogs: (filters?: any) =>
    apiClient.post('/admin/audit-logs', filters || {}),

  // System settings
  getSystemSettings: () =>
    apiClient.get('/admin/settings'),

  updateSystemSetting: (key: string, data: any) =>
    apiClient.put(`/admin/settings/${key}`, data),

  // Work Task Management
  submitWorkTask: (data: any) =>
    apiClient.post('/api/v1/work-tasks', data),

  getWorkTask: (taskId: string) =>
    apiClient.get(`/api/v1/work-tasks/${taskId}`),

  getWorkTaskAnalysis: (taskId: string) =>
    apiClient.get(`/api/v1/work-tasks/${taskId}/analysis`),

  getWorkTasks: (params?: {
    teamId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.teamId) queryParams.set('teamId', params.teamId);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    
    const query = queryParams.toString();
    return apiClient.get(`/api/v1/work-tasks${query ? `?${query}` : ''}`);
  },

  updateWorkTaskStatus: (taskId: string, data: { status: string; notes?: string }) =>
    apiClient.put(`/api/v1/work-tasks/${taskId}/status`, data),

  // Todo Management
  getTodos: (taskId: string) =>
    apiClient.get(`/api/v1/work-tasks/${taskId}/todos`),

  updateTodoStatus: (todoId: string, data: any) =>
    apiClient.put(`/api/v1/todos/${todoId}/status`, data),

  submitDeliverable: (todoId: string, file: File, metadata?: any) =>
    apiClient.uploadFile(`/api/v1/todos/${todoId}/deliverables`, file, metadata),

  getTaskProgress: (taskId: string) =>
    apiClient.get(`/api/v1/work-tasks/${taskId}/progress`),

  // Quality Check
  performQualityCheck: (deliverableId: string, data?: any) =>
    apiClient.post(`/api/v1/deliverables/${deliverableId}/quality-check`, data),

  getQualityReport: (deliverableId: string) =>
    apiClient.get(`/api/v1/deliverables/${deliverableId}/quality-report`),

  batchQualityCheck: (taskId: string) =>
    apiClient.post(`/api/v1/work-tasks/${taskId}/batch-quality-check`),

  // Integration
  createJiraIssue: (data: any) =>
    apiClient.post('/jira/create', data),
  
  sendSlackNotification: (data: any) =>
    apiClient.post('/slack/notify', data),
};