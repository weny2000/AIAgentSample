import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '../Dashboard';
import { useAuthStore } from '../../stores/authStore';
import * as api from '../../lib/api';

// Mock dependencies
jest.mock('../../stores/authStore');
jest.mock('../../lib/api');

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;
const mockApi = api as jest.Mocked<typeof api>;

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'custom:team_id': 'team-1',
        'custom:role': 'developer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });
  });

  it('should render dashboard with overview cards', async () => {
    const mockDashboardData = {
      recent_checks: [
        {
          id: 'check-1',
          artifact_name: 'deployment.yaml',
          status: 'completed',
          score: 85,
          created_at: '2023-01-01T10:00:00Z',
        },
        {
          id: 'check-2',
          artifact_name: 'config.json',
          status: 'failed',
          score: 45,
          created_at: '2023-01-01T09:00:00Z',
        },
      ],
      pending_issues: [
        {
          id: 'issue-1',
          title: 'Security vulnerability detected',
          severity: 'high',
          service: 'user-service',
          created_at: '2023-01-01T08:00:00Z',
        },
      ],
      team_stats: {
        total_checks: 150,
        success_rate: 0.82,
        avg_score: 78,
        active_issues: 5,
      },
      notifications: [
        {
          id: 'notif-1',
          message: 'New policy update available',
          type: 'info',
          created_at: '2023-01-01T07:00:00Z',
        },
      ],
    };

    mockApi.getDashboardData.mockResolvedValue(mockDashboardData);

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome back, Test User')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Recent Checks')).toBeInTheDocument();
      expect(screen.getByText('Pending Issues')).toBeInTheDocument();
      expect(screen.getByText('Team Statistics')).toBeInTheDocument();
    });

    // Check recent checks
    expect(screen.getByText('deployment.yaml')).toBeInTheDocument();
    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();

    // Check pending issues
    expect(screen.getByText('Security vulnerability detected')).toBeInTheDocument();
    expect(screen.getByText('user-service')).toBeInTheDocument();

    // Check team stats
    expect(screen.getByText('150')).toBeInTheDocument(); // total checks
    expect(screen.getByText('82%')).toBeInTheDocument(); // success rate
    expect(screen.getByText('78')).toBeInTheDocument(); // avg score
    expect(screen.getByText('5')).toBeInTheDocument(); // active issues
  });

  it('should show loading state initially', () => {
    mockApi.getDashboardData.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
  });

  it('should handle API errors gracefully', async () => {
    mockApi.getDashboardData.mockRejectedValue(new Error('API Error'));

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/error loading dashboard data/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no data is available', async () => {
    const emptyData = {
      recent_checks: [],
      pending_issues: [],
      team_stats: {
        total_checks: 0,
        success_rate: 0,
        avg_score: 0,
        active_issues: 0,
      },
      notifications: [],
    };

    mockApi.getDashboardData.mockResolvedValue(emptyData);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('No recent checks')).toBeInTheDocument();
      expect(screen.getByText('No pending issues')).toBeInTheDocument();
    });
  });

  it('should display different severity badges correctly', async () => {
    const mockData = {
      recent_checks: [],
      pending_issues: [
        {
          id: 'issue-1',
          title: 'Critical security issue',
          severity: 'critical',
          service: 'auth-service',
          created_at: '2023-01-01T08:00:00Z',
        },
        {
          id: 'issue-2',
          title: 'Medium priority issue',
          severity: 'medium',
          service: 'api-service',
          created_at: '2023-01-01T07:00:00Z',
        },
        {
          id: 'issue-3',
          title: 'Low priority issue',
          severity: 'low',
          service: 'ui-service',
          created_at: '2023-01-01T06:00:00Z',
        },
      ],
      team_stats: {
        total_checks: 0,
        success_rate: 0,
        avg_score: 0,
        active_issues: 3,
      },
      notifications: [],
    };

    mockApi.getDashboardData.mockResolvedValue(mockData);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Critical security issue')).toBeInTheDocument();
      expect(screen.getByText('Medium priority issue')).toBeInTheDocument();
      expect(screen.getByText('Low priority issue')).toBeInTheDocument();
    });

    // Check that severity badges are rendered with appropriate styling
    const criticalBadge = screen.getByText('critical');
    const mediumBadge = screen.getByText('medium');
    const lowBadge = screen.getByText('low');

    expect(criticalBadge).toHaveClass('bg-red-100', 'text-red-800');
    expect(mediumBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');
    expect(lowBadge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('should show quick action buttons', async () => {
    const mockData = {
      recent_checks: [],
      pending_issues: [],
      team_stats: {
        total_checks: 0,
        success_rate: 0,
        avg_score: 0,
        active_issues: 0,
      },
      notifications: [],
    };

    mockApi.getDashboardData.mockResolvedValue(mockData);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Upload Artifact')).toBeInTheDocument();
      expect(screen.getByText('Query Agent')).toBeInTheDocument();
      expect(screen.getByText('View Reports')).toBeInTheDocument();
    });
  });

  it('should refresh data when refresh button is clicked', async () => {
    const mockData = {
      recent_checks: [],
      pending_issues: [],
      team_stats: {
        total_checks: 0,
        success_rate: 0,
        avg_score: 0,
        active_issues: 0,
      },
      notifications: [],
    };

    mockApi.getDashboardData.mockResolvedValue(mockData);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(mockApi.getDashboardData).toHaveBeenCalledTimes(1);
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    refreshButton.click();

    await waitFor(() => {
      expect(mockApi.getDashboardData).toHaveBeenCalledTimes(2);
    });
  });
});