import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
  // Agent operations
  checkArtifact: (data: { file: File; type: string }) =>
    apiClient.uploadFile('/agent/check', data.file, { type: data.type }),
  
  getCheckStatus: (jobId: string) =>
    apiClient.get(`/agent/status/${jobId}`),
  
  queryAgent: (data: { query: string; context?: string }) =>
    apiClient.post('/agent/query', data),

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

  // Integration
  createJiraIssue: (data: any) =>
    apiClient.post('/jira/create', data),
  
  sendSlackNotification: (data: any) =>
    apiClient.post('/slack/notify', data),
};