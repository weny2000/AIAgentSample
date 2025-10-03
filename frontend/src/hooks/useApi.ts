import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';

// Query Keys
export const queryKeys = {
  checkStatus: (jobId: string) => ['checkStatus', jobId],
  personas: () => ['personas'],
  policies: () => ['policies'],
  users: () => ['users'],
  auditLogs: (filters?: any) => ['auditLogs', filters],
  systemSettings: () => ['systemSettings'],
  search: (query: string) => ['search', query],
};

// Agent Operations
export const useCheckStatus = (jobId: string | null, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.checkStatus(jobId || ''),
    queryFn: () => api.getCheckStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (data) => {
      // Stop polling if job is completed or failed
      if (data && typeof data === 'object' && 'status' in data) {
        const status = (data as any).status;
        if (status === 'completed' || status === 'failed') {
          return false;
        }
      }
      return 2000; // Poll every 2 seconds
    },
  });
};

export const useCheckArtifact = () => {
  const { addNotification, setCurrentJobId } = useAppStore();
  
  return useMutation({
    mutationFn: api.checkArtifact,
    onSuccess: (data: any) => {
      setCurrentJobId(data.jobId);
      addNotification({
        type: 'success',
        title: 'Artifact Uploaded',
        message: 'Your artifact has been queued for verification.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Upload Failed',
        message: error.message || 'Failed to upload artifact.',
      });
    },
  });
};

export const useQueryAgent = () => {
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.queryAgent,
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Query Failed',
        message: error.message || 'Failed to query agent.',
      });
    },
  });
};

// Search Operations
export const useSearch = (query: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => api.search({ query }),
    enabled: enabled && query.length > 2,
    staleTime: 30000, // 30 seconds
  });
};

// Admin Operations
export const usePersonas = () => {
  return useQuery({
    queryKey: queryKeys.personas(),
    queryFn: api.getPersonas,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCreatePersona = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.createPersona,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas() });
      addNotification({
        type: 'success',
        title: 'Persona Created',
        message: 'New persona has been created successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Creation Failed',
        message: error.message || 'Failed to create persona.',
      });
    },
  });
};

export const useUpdatePersona = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      api.updatePersona(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas() });
      addNotification({
        type: 'success',
        title: 'Persona Updated',
        message: 'Persona has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update persona.',
      });
    },
  });
};

export const usePolicies = () => {
  return useQuery({
    queryKey: queryKeys.policies(),
    queryFn: api.getPolicies,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCreatePolicy = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies() });
      addNotification({
        type: 'success',
        title: 'Policy Created',
        message: 'New policy has been created successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Creation Failed',
        message: error.message || 'Failed to create policy.',
      });
    },
  });
};

export const useUpdatePolicy = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      api.updatePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies() });
      addNotification({
        type: 'success',
        title: 'Policy Updated',
        message: 'Policy has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update policy.',
      });
    },
  });
};

export const useDeletePersona = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.deletePersona,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas() });
      addNotification({
        type: 'success',
        title: 'Persona Deleted',
        message: 'Persona has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete persona.',
      });
    },
  });
};

export const useDeletePolicy = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies() });
      addNotification({
        type: 'success',
        title: 'Policy Deleted',
        message: 'Policy has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Delete Failed',
        message: error.message || 'Failed to delete policy.',
      });
    },
  });
};

// User Management
export const useUsers = () => {
  return useQuery({
    queryKey: queryKeys.users(),
    queryFn: api.getUsers,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users() });
      addNotification({
        type: 'success',
        title: 'User Updated',
        message: 'User has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update user.',
      });
    },
  });
};

// Audit Logs
export const useAuditLogs = (filters?: any) => {
  return useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => api.getAuditLogs(filters),
    staleTime: 30000, // 30 seconds
  });
};

// System Settings
export const useSystemSettings = () => {
  return useQuery({
    queryKey: queryKeys.systemSettings(),
    queryFn: api.getSystemSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUpdateSystemSetting = () => {
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: any }) => 
      api.updateSystemSetting(key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
      addNotification({
        type: 'success',
        title: 'Setting Updated',
        message: 'System setting has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update system setting.',
      });
    },
  });
};

// Integration Operations
export const useCreateJiraIssue = () => {
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.createJiraIssue,
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Issue Created',
        message: 'Jira issue has been created successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Creation Failed',
        message: error.message || 'Failed to create Jira issue.',
      });
    },
  });
};

export const useSendSlackNotification = () => {
  const { addNotification } = useAppStore();
  
  return useMutation({
    mutationFn: api.sendSlackNotification,
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: 'Notification Sent',
        message: 'Slack notification has been sent successfully.',
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Send Failed',
        message: error.message || 'Failed to send Slack notification.',
      });
    },
  });
};