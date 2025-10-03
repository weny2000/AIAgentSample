import { authService } from '../authService';

// Mock environment variables
const mockEnv = {
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_TEST123456',
  VITE_COGNITO_CLIENT_ID: 'test-client-id',
  VITE_AWS_REGION: 'us-east-1',
  VITE_COGNITO_DOMAIN: 'ai-agent-test-123456789012',
  VITE_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  VITE_LOGOUT_URI: 'http://localhost:3000/auth/logout',
};

// Mock process.env
Object.defineProperty(process, 'env', {
  value: mockEnv,
});

// Mock fetch
global.fetch = jest.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    origin: 'http://localhost:3000',
  },
  writable: true,
});

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.location.href
    window.location.href = '';
  });

  describe('initiateOIDCLogin', () => {
    it('should redirect to Cognito OAuth URL', () => {
      authService.initiateOIDCLogin();

      expect(window.location.href).toContain('https://ai-agent-test-123456789012.auth.us-east-1.amazoncognito.com/oauth2/authorize');
      expect(window.location.href).toContain('response_type=code');
      expect(window.location.href).toContain('client_id=test-client-id');
      expect(window.location.href).toContain('scope=openid%20email%20profile');
    });

    it('should store state and nonce in sessionStorage', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      
      authService.initiateOIDCLogin();

      expect(setItemSpy).toHaveBeenCalledWith('oauth_state', expect.any(String));
      expect(setItemSpy).toHaveBeenCalledWith('oauth_nonce', expect.any(String));
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      // Create a token that expired 1 hour ago
      const expiredTime = Math.floor(Date.now() / 1000) - 3600;
      const expiredToken = createMockJWT({ exp: expiredTime });

      expect(authService.isTokenExpired(expiredToken)).toBe(true);
    });

    it('should return false for valid token', () => {
      // Create a token that expires in 1 hour
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const validToken = createMockJWT({ exp: futureTime });

      expect(authService.isTokenExpired(validToken)).toBe(false);
    });

    it('should return true for invalid token', () => {
      expect(authService.isTokenExpired('invalid-token')).toBe(true);
    });
  });

  describe('getTokenExpirationTime', () => {
    it('should return correct time until expiration', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
      const token = createMockJWT({ exp: futureTime });

      const timeLeft = authService.getTokenExpirationTime(token);
      expect(timeLeft).toBeGreaterThan(1790); // Allow for small timing differences
      expect(timeLeft).toBeLessThan(1810);
    });

    it('should return 0 for expired token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const expiredToken = createMockJWT({ exp: pastTime });

      expect(authService.getTokenExpirationTime(expiredToken)).toBe(0);
    });
  });

  describe('handleOIDCCallback', () => {
    it('should throw error for invalid state', async () => {
      sessionStorage.setItem('oauth_state', 'stored-state');

      await expect(
        authService.handleOIDCCallback('test-code', 'different-state')
      ).rejects.toThrow('Invalid state parameter');
    });

    it('should exchange code for tokens successfully', async () => {
      const mockTokenResponse = {
        access_token: 'mock-access-token',
        id_token: createMockJWT({
          sub: 'user-123',
          email: 'test@example.com',
          given_name: 'John',
          family_name: 'Doe',
          'custom:department': 'Engineering',
          'custom:team_id': 'team-alpha',
          'custom:role': 'developer',
          'custom:clearance': 'standard',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        refresh_token: 'mock-refresh-token',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      sessionStorage.setItem('oauth_state', 'test-state');

      const result = await authService.handleOIDCCallback('test-code', 'test-state');

      expect(result.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        role: 'developer',
        department: 'Engineering',
        team_id: 'team-alpha',
        clearance: 'standard',
      });

      expect(result.tokens).toEqual({
        accessToken: 'mock-access-token',
        idToken: mockTokenResponse.id_token,
        refreshToken: 'mock-refresh-token',
      });
    });
  });
});

// Helper function to create mock JWT tokens
function createMockJWT(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}