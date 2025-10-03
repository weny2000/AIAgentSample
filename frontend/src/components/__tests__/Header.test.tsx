import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from '../Header';
import { useAuthStore } from '../../stores/authStore';

// Mock the auth store
jest.mock('../../stores/authStore');

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

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

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render header with user information when authenticated', () => {
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

    renderWithProviders(<Header />);

    expect(screen.getByText('AI Agent System')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('should render login button when not authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithProviders(<Header />);

    expect(screen.getByText('AI Agent System')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
  });

  it('should call login when login button is clicked', () => {
    const mockLogin = jest.fn();
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
      login: mockLogin,
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithProviders(<Header />);

    const loginButton = screen.getByText('Login');
    fireEvent.click(loginButton);

    expect(mockLogin).toHaveBeenCalled();
  });

  it('should show user dropdown menu when user avatar is clicked', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'custom:team_id': 'team-1',
        'custom:role': 'admin',
      },
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithProviders(<Header />);

    const userButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userButton);

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should call logout when logout is clicked', () => {
    const mockLogout = jest.fn();
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        'custom:team_id': 'team-1',
        'custom:role': 'developer',
      },
      logout: mockLogout,
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: false,
    });

    renderWithProviders(<Header />);

    const userButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userButton);

    const logoutButton = screen.getByText('Logout');
    fireEvent.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show admin link for admin users', () => {
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

    renderWithProviders(<Header />);

    const userButton = screen.getByRole('button', { name: /admin user/i });
    fireEvent.click(userButton);

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('should not show admin link for non-admin users', () => {
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

    renderWithProviders(<Header />);

    const userButton = screen.getByRole('button', { name: /regular user/i });
    fireEvent.click(userButton);

    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });

  it('should show loading state when authentication is loading', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      isLoading: true,
    });

    renderWithProviders(<Header />);

    expect(screen.getByText('AI Agent System')).toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
  });
});