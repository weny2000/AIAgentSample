import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { useAuthStore } from '../../stores/authStore';

// Mock the auth store
jest.mock('../../stores/authStore');

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom Navigate component
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Navigate: ({ to }: { to: string }) => {
    mockNavigate(to);
    return <div data-testid="navigate">Redirecting to {to}</div>;
  },
}));

const TestComponent = () => <div data-testid="protected-content">Protected Content</div>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children when user is authenticated', () => {
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

    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('should redirect to login when user is not authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('should show loading spinner when authentication is loading', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: true,
    });

    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
  });

  it('should render children when user has required role', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'admin@example.com',
        name: 'Admin User',
        'custom:team_id': 'admin-team',
        'custom:role': 'admin',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredRole="admin">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('should redirect to unauthorized when user lacks required role', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Regular User',
        'custom:team_id': 'team-1',
        'custom:role': 'developer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredRole="admin">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });

  it('should render children when user belongs to required team', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Team User',
        'custom:team_id': 'backend-team',
        'custom:role': 'developer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredTeam="backend-team">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('should redirect to unauthorized when user is not in required team', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Team User',
        'custom:team_id': 'frontend-team',
        'custom:role': 'developer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredTeam="backend-team">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });

  it('should handle multiple requirements (role and team)', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'lead@example.com',
        name: 'Team Lead',
        'custom:team_id': 'backend-team',
        'custom:role': 'lead',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredRole="lead" requiredTeam="backend-team">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('should redirect when user meets team requirement but not role requirement', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'dev@example.com',
        name: 'Developer',
        'custom:team_id': 'backend-team',
        'custom:role': 'developer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithRouter(
      <ProtectedRoute requiredRole="lead" requiredTeam="backend-team">
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });
});