import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AgentChat } from '../AgentChat';
import { useAuthStore } from '../../../stores/authStore';
import * as useWebSocketModule from '../../../hooks/useWebSocket';

// Mock the auth store
jest.mock('../../../stores/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock the WebSocket hook
jest.mock('../../../hooks/useWebSocket');
const mockUseWebSocket = useWebSocketModule.useWebSocket as jest.MockedFunction<typeof useWebSocketModule.useWebSocket>;

// Mock the API
jest.mock('../../../lib/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn()
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AgentChat', () => {
  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    department: 'engineering',
    team_id: 'team-1',
    clearance: 'standard'
  };

  const mockWebSocketHook = {
    isConnected: true,
    connectionStatus: 'connected' as const,
    sendMessage: jest.fn(),
    lastMessage: null,
    reconnect: jest.fn(),
    disconnect: jest.fn()
  };

  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      token: 'mock-token',
      refreshToken: 'mock-refresh-token',
      login: jest.fn(),
      logout: jest.fn(),
      refreshTokens: jest.fn(),
      handleSessionExpired: jest.fn()
    });

    mockUseWebSocket.mockReturnValue(mockWebSocketHook);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<AgentChat />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Starting agent session...')).toBeInTheDocument();
  });

  it('renders chat interface after session starts', async () => {
    const mockSession = {
      sessionId: 'session-1',
      agentConfiguration: {
        agentId: 'agent-1',
        name: 'AI Assistant',
        description: 'Test assistant'
      },
      capabilities: [],
      welcomeMessage: 'Hello! How can I help you?'
    };

    // Mock successful session start
    const { api } = require('../../../lib/api');
    api.post.mockResolvedValueOnce(mockSession);

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
      expect(screen.getByText('Test assistant')).toBeInTheDocument();
    });
  });

  it('displays welcome message when session starts', async () => {
    const mockSession = {
      sessionId: 'session-1',
      agentConfiguration: {
        agentId: 'agent-1',
        name: 'AI Assistant',
        description: 'Test assistant'
      },
      capabilities: [],
      welcomeMessage: 'Welcome to AgentCore!'
    };

    const { api } = require('../../../lib/api');
    api.post.mockResolvedValueOnce(mockSession);

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Welcome to AgentCore!')).toBeInTheDocument();
    });
  });

  it('sends message via WebSocket when connected', async () => {
    const mockSession = {
      sessionId: 'session-1',
      agentConfiguration: {
        agentId: 'agent-1',
        name: 'AI Assistant',
        description: 'Test assistant'
      },
      capabilities: []
    };

    const { api } = require('../../../lib/api');
    api.post.mockResolvedValueOnce(mockSession);

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    // Type a message
    const input = screen.getByPlaceholderText('Ask your agent a question...');
    fireEvent.change(input, { target: { value: 'Hello agent' } });

    // Send the message
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    expect(mockWebSocketHook.sendMessage).toHaveBeenCalledWith({
      action: 'message',
      sessionId: 'session-1',
      message: 'Hello agent',
      messageType: 'text'
    });
  });

  it('handles WebSocket disconnection gracefully', async () => {
    const disconnectedWebSocketHook = {
      ...mockWebSocketHook,
      isConnected: false,
      connectionStatus: 'disconnected' as const
    };

    mockUseWebSocket.mockReturnValue(disconnectedWebSocketHook);

    const mockSession = {
      sessionId: 'session-1',
      agentConfiguration: {
        agentId: 'agent-1',
        name: 'AI Assistant',
        description: 'Test assistant'
      },
      capabilities: []
    };

    const { api } = require('../../../lib/api');
    api.post.mockResolvedValueOnce(mockSession);

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    // Check that send button is disabled when disconnected
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('displays error message when session fails to start', async () => {
    const { api } = require('../../../lib/api');
    api.post.mockRejectedValueOnce(new Error('Failed to start session'));

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Failed to start agent session')).toBeInTheDocument();
      expect(screen.getByText('Failed to start session')).toBeInTheDocument();
    });
  });

  it('handles quick actions correctly', async () => {
    const mockSession = {
      sessionId: 'session-1',
      agentConfiguration: {
        agentId: 'agent-1',
        name: 'AI Assistant',
        description: 'Test assistant'
      },
      capabilities: [
        {
          id: 'policy_analysis',
          name: 'Policy Analysis',
          description: 'Analyze policies',
          category: 'analysis' as const,
          enabled: true
        }
      ]
    };

    const { api } = require('../../../lib/api');
    api.post.mockResolvedValueOnce(mockSession);

    render(<AgentChat />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    // Click on a quick action
    const policyButton = screen.getByText('Show Policies');
    fireEvent.click(policyButton);

    expect(mockWebSocketHook.sendMessage).toHaveBeenCalledWith({
      action: 'message',
      sessionId: 'session-1',
      message: 'What are the current policies for our team?',
      messageType: 'text'
    });
  });
});