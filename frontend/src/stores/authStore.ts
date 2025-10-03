import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, AuthUser, CognitoTokens } from '../services/authService';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  team_id: string;
  clearance: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  idToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  sessionTimeout: number | null;
  
  // Actions
  login: (user: AuthUser, tokens: CognitoTokens) => void;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  refreshTokens: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  handleSessionExpired: () => void;
  updateTokens: (tokens: CognitoTokens) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      idToken: null,
      refreshToken: null,
      isLoading: false,
      sessionTimeout: null,

      login: (user: AuthUser, tokens: CognitoTokens) => {
        set({
          isAuthenticated: true,
          user,
          token: tokens.accessToken,
          idToken: tokens.idToken,
          refreshToken: tokens.refreshToken,
          isLoading: false,
          sessionTimeout: authService.getTokenExpirationTime(tokens.accessToken),
        });
      },

      logout: async () => {
        const { token } = get();
        set({ isLoading: true });
        
        try {
          await authService.logout(token || undefined);
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            idToken: null,
            refreshToken: null,
            isLoading: false,
            sessionTimeout: null,
          });
        }
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, ...userData },
          });
        }
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const newTokens = await authService.refreshTokens(refreshToken);
          set({
            token: newTokens.accessToken,
            idToken: newTokens.idToken,
            sessionTimeout: authService.getTokenExpirationTime(newTokens.accessToken),
          });
        } catch (error) {
          console.error('Token refresh failed:', error);
          // If refresh fails, logout user
          get().handleSessionExpired();
          throw error;
        }
      },

      checkSession: async (): Promise<boolean> => {
        const { token, refreshToken } = get();
        
        if (!token || !refreshToken) {
          return false;
        }

        // Check if token is expired
        if (authService.isTokenExpired(token)) {
          try {
            await get().refreshTokens();
            return true;
          } catch {
            return false;
          }
        }

        return true;
      },

      handleSessionExpired: () => {
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          idToken: null,
          refreshToken: null,
          isLoading: false,
          sessionTimeout: null,
        });
        
        // Redirect to login
        window.location.href = '/login';
      },

      updateTokens: (tokens: CognitoTokens) => {
        set({
          token: tokens.accessToken,
          idToken: tokens.idToken,
          refreshToken: tokens.refreshToken,
          sessionTimeout: authService.getTokenExpirationTime(tokens.accessToken),
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token,
        idToken: state.idToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);