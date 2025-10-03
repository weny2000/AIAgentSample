// import {
//   CognitoUserPool,
// } from 'amazon-cognito-identity-js';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { jwtDecode } from 'jwt-decode';

// Configuration - these would typically come from environment variables
const COGNITO_CONFIG = {
  userPoolId: process.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_XXXXXXXXX',
  clientId: process.env.VITE_COGNITO_CLIENT_ID || 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  region: process.env.VITE_AWS_REGION || 'us-east-1',
  domain: process.env.VITE_COGNITO_DOMAIN || 'ai-agent-dev-123456789012',
  redirectUri: process.env.VITE_REDIRECT_URI || window.location.origin + '/auth/callback',
  logoutUri: process.env.VITE_LOGOUT_URI || window.location.origin + '/auth/logout',
};

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface DecodedToken {
  sub: string;
  username: string;
  email: string;
  given_name: string;
  family_name: string;
  'custom:department': string;
  'custom:team_id': string;
  'custom:role': string;
  'custom:clearance': string;
  exp: number;
  iat: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  team_id: string;
  clearance: string;
}

class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private sessionCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: COGNITO_CONFIG.region,
    });
  }

  /**
   * Initialize OIDC authentication flow
   */
  public initiateOIDCLogin(): void {
    const state = this.generateRandomString(32);
    const nonce = this.generateRandomString(32);
    
    // Store state and nonce for validation
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_nonce', nonce);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: COGNITO_CONFIG.clientId,
      redirect_uri: COGNITO_CONFIG.redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
    });

    const authUrl = `https://${COGNITO_CONFIG.domain}.auth.${COGNITO_CONFIG.region}.amazoncognito.com/oauth2/authorize?${params}`;
    window.location.href = authUrl;
  }

  /**
   * Handle OIDC callback and exchange code for tokens
   */
  public async handleOIDCCallback(code: string, state: string): Promise<{ user: AuthUser; tokens: CognitoTokens }> {
    // Validate state parameter
    const storedState = sessionStorage.getItem('oauth_state');
    if (!storedState || storedState !== state) {
      throw new Error('Invalid state parameter');
    }

    // Clean up stored state
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_nonce');

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);
      const tokens: CognitoTokens = {
        accessToken: tokenResponse.access_token,
        idToken: tokenResponse.id_token,
        refreshToken: tokenResponse.refresh_token,
      };

      // Decode and validate ID token
      const decodedToken = this.decodeAndValidateToken(tokens.idToken);
      const user = this.mapTokenToUser(decodedToken);

      // Start session monitoring
      this.startSessionMonitoring(tokens);

      return { user, tokens };
    } catch (error) {
      console.error('OIDC callback error:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshTokens(refreshToken: string): Promise<CognitoTokens> {
    try {
      const response = await fetch(`https://${COGNITO_CONFIG.domain}.auth.${COGNITO_CONFIG.region}.amazoncognito.com/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: COGNITO_CONFIG.clientId,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: refreshToken, // Refresh token doesn't change
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Logout user and revoke tokens
   */
  public async logout(accessToken?: string): Promise<void> {
    try {
      // Stop session monitoring
      this.stopSessionMonitoring();

      // Revoke tokens if available
      if (accessToken) {
        await this.revokeToken(accessToken);
      }

      // Clear local storage
      this.clearStoredTokens();

      // Redirect to Cognito logout
      const logoutUrl = `https://${COGNITO_CONFIG.domain}.auth.${COGNITO_CONFIG.region}.amazoncognito.com/logout?client_id=${COGNITO_CONFIG.clientId}&logout_uri=${encodeURIComponent(COGNITO_CONFIG.logoutUri)}`;
      window.location.href = logoutUrl;
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      this.clearStoredTokens();
      window.location.href = '/login';
    }
  }

  /**
   * Get current user information from access token
   */
  public async getCurrentUser(accessToken: string): Promise<AuthUser> {
    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const response = await this.cognitoClient.send(command);
      
      // Map Cognito user attributes to our user format
      const attributes = response.UserAttributes || [];
      const getAttributeValue = (name: string) => 
        attributes.find(attr => attr.Name === name)?.Value || '';

      return {
        id: response.Username || '',
        email: getAttributeValue('email'),
        name: `${getAttributeValue('given_name')} ${getAttributeValue('family_name')}`.trim(),
        role: getAttributeValue('custom:role'),
        department: getAttributeValue('custom:department'),
        team_id: getAttributeValue('custom:team_id'),
        clearance: getAttributeValue('custom:clearance'),
      };
    } catch (error) {
      console.error('Get current user error:', error);
      throw error;
    }
  }

  /**
   * Check if token is expired
   */
  public isTokenExpired(token: string): boolean {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch {
      return true;
    }
  }

  /**
   * Get time until token expires (in seconds)
   */
  public getTokenExpirationTime(token: string): number {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return Math.max(0, decoded.exp - currentTime);
    } catch {
      return 0;
    }
  }

  /**
   * Start monitoring session and auto-refresh tokens
   */
  private startSessionMonitoring(tokens: CognitoTokens): void {
    this.stopSessionMonitoring(); // Clear any existing interval

    this.sessionCheckInterval = setInterval(async () => {
      const timeUntilExpiry = this.getTokenExpirationTime(tokens.accessToken);
      
      // Refresh token if it expires in the next 5 minutes
      if (timeUntilExpiry > 0 && timeUntilExpiry < 300) {
        try {
          const newTokens = await this.refreshTokens(tokens.refreshToken);
          
          // Update tokens in memory
          tokens.accessToken = newTokens.accessToken;
          tokens.idToken = newTokens.idToken;
          
          // Notify the application about token refresh
          window.dispatchEvent(new CustomEvent('tokenRefresh', { 
            detail: newTokens 
          }));
        } catch (error) {
          console.error('Auto token refresh failed:', error);
          // If refresh fails, logout user
          window.dispatchEvent(new CustomEvent('sessionExpired'));
        }
      } else if (timeUntilExpiry === 0) {
        // Token has expired
        window.dispatchEvent(new CustomEvent('sessionExpired'));
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop session monitoring
   */
  private stopSessionMonitoring(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<any> {
    const response = await fetch(`https://${COGNITO_CONFIG.domain}.auth.${COGNITO_CONFIG.region}.amazoncognito.com/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CONFIG.clientId,
        code,
        redirect_uri: COGNITO_CONFIG.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Decode and validate JWT token
   */
  private decodeAndValidateToken(token: string): DecodedToken {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      
      // Basic validation
      if (!decoded.sub || !decoded.email) {
        throw new Error('Invalid token payload');
      }

      // Check if token is expired
      if (this.isTokenExpired(token)) {
        throw new Error('Token is expired');
      }

      return decoded;
    } catch (error) {
      console.error('Token validation error:', error);
      throw error;
    }
  }

  /**
   * Map decoded token to user object
   */
  private mapTokenToUser(token: DecodedToken): AuthUser {
    return {
      id: token.sub,
      email: token.email,
      name: `${token.given_name || ''} ${token.family_name || ''}`.trim(),
      role: token['custom:role'] || 'user',
      department: token['custom:department'] || '',
      team_id: token['custom:team_id'] || '',
      clearance: token['custom:clearance'] || 'standard',
    };
  }

  /**
   * Revoke access token
   */
  private async revokeToken(token: string): Promise<void> {
    try {
      await fetch(`https://${COGNITO_CONFIG.domain}.auth.${COGNITO_CONFIG.region}.amazoncognito.com/oauth2/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token,
          client_id: COGNITO_CONFIG.clientId,
        }),
      });
    } catch (error) {
      console.error('Token revocation error:', error);
      // Don't throw - logout should continue even if revocation fails
    }
  }

  /**
   * Clear stored tokens from local storage
   */
  private clearStoredTokens(): void {
    localStorage.removeItem('auth-storage');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_nonce');
  }

  /**
   * Generate random string for state/nonce
   */
  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }
}

export const authService = new AuthService();