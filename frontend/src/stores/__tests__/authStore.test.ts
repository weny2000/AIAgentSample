import { useAuthStore } from '../authStore';
import { authService } from '../../services/authService';

// Mock the auth service
jest.mock('../../services/authService');
const mockAuthService = authService as jest.Mocked<typeof authService>;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('AuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      idToken: null,
      refreshToken: null,
      isLoading: false,
      sessionTimeout: null,
    });
  });

  describe('login', () => {
    it('should set user and tokens on login', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        role: 'developer',
        department: 'Engineering',
        team_id: 'team-alpha',
        clearance: 'standard',
      };

      const mockTokens = {
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.getTokenExpirationTime.mockReturnValue(3600);

      const { login } = useAuthStore.getState();
      login(mockUser, mockTokens);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe('access-token');
      expect(state.idToken).toBe('id-token');
      expect(state.refreshToken).toBe('refresh-token');
      expect(state.sessionTimeout).toBe(3600);
    });
  });

  describe('logout', () => {
    it('should clear user data and call auth service logout', async () => {
      // Set initial authenticated state
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'John Doe',
          role: 'developer',
          department: 'Engineering',
          team_id: 'team-alpha',
          clearance: 'standard',
        },
        token: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
      });

      mockAuthService.logout.mockResolvedValue();

      const { logout } = useAuthStore.getState();
      await logout();

      expect(mockAuthService.logout).toHaveBeenCalledWith('access-token');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.idToken).toBeNull();
      expect(state.refreshToken).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('should update tokens on successful refresh', async () => {
      useAuthStore.setState({
        refreshToken: 'refresh-token',
      });

      const newTokens = {
        accessToken: 'new-access-token',
        idToken: 'new-id-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.refreshTokens.mockResolvedValue(newTokens);
      mockAuthService.getTokenExpirationTime.mockReturnValue(3600);

      const { refreshTokens } = useAuthStore.getState();
      await refreshTokens();

      const state = useAuthStore.getState();
      expect(state.token).toBe('new-access-token');
      expect(state.idToken).toBe('new-id-token');
      expect(state.sessionTimeout).toBe(3600);
    });

    it('should handle session expiry on refresh failure', async () => {
      useAuthStore.setState({
        refreshToken: 'refresh-token',
        isAuthenticated: true,
      });

      mockAuthService.refreshTokens.mockRejectedValue(new Error('Refresh failed'));

      const { refreshTokens } = useAuthStore.getState();

      await expect(refreshTokens()).rejects.toThrow('Refresh failed');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('checkSession', () => {
    it('should return false if no tokens', async () => {
      const { checkSession } = useAuthStore.getState();
      const result = await checkSession();

      expect(result).toBe(false);
    });

    it('should refresh expired tokens and return true', async () => {
      useAuthStore.setState({
        token: 'expired-token',
        refreshToken: 'refresh-token',
      });

      mockAuthService.isTokenExpired.mockReturnValue(true);
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-token',
        idToken: 'new-id-token',
        refreshToken: 'refresh-token',
      });
      mockAuthService.getTokenExpirationTime.mockReturnValue(3600);

      const { checkSession } = useAuthStore.getState();
      const result = await checkSession();

      expect(result).toBe(true);
      expect(mockAuthService.refreshTokens).toHaveBeenCalled();
    });

    it('should return true for valid tokens', async () => {
      useAuthStore.setState({
        token: 'valid-token',
        refreshToken: 'refresh-token',
      });

      mockAuthService.isTokenExpired.mockReturnValue(false);

      const { checkSession } = useAuthStore.getState();
      const result = await checkSession();

      expect(result).toBe(true);
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    it('should update user data', () => {
      useAuthStore.setState({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'John Doe',
          role: 'developer',
          department: 'Engineering',
          team_id: 'team-alpha',
          clearance: 'standard',
        },
      });

      const { updateUser } = useAuthStore.getState();
      updateUser({ role: 'senior-developer', clearance: 'elevated' });

      const state = useAuthStore.getState();
      expect(state.user?.role).toBe('senior-developer');
      expect(state.user?.clearance).toBe('elevated');
      expect(state.user?.name).toBe('John Doe'); // Should preserve other fields
    });

    it('should not update if no user', () => {
      const { updateUser } = useAuthStore.getState();
      updateUser({ role: 'admin' });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });
  });
});