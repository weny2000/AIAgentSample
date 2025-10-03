import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { authService } from '../services/authService';

export const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, checkSession } = useAuthStore();
  const { addNotification } = useAppStore();

  const from = location.state?.from?.pathname || '/dashboard';

  // Check if user is already authenticated
  useEffect(() => {
    const checkExistingSession = async () => {
      if (isAuthenticated) {
        try {
          const isValid = await checkSession();
          if (isValid) {
            navigate(from, { replace: true });
            return;
          }
        } catch (error) {
          console.error('Session check failed:', error);
        }
      }
    };

    checkExistingSession();
  }, [isAuthenticated, checkSession, navigate, from]);

  const handleOIDCLogin = async () => {
    setIsLoading(true);
    
    try {
      // Store the intended destination
      if (from !== '/dashboard') {
        sessionStorage.setItem('auth_redirect', from);
      }

      // Initiate OIDC flow
      authService.initiateOIDCLogin();
      
    } catch (error) {
      console.error('Login initiation error:', error);
      
      addNotification({
        type: 'error',
        title: 'Login Failed',
        message: 'Unable to initiate authentication. Please try again.',
      });
      
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-600">
            <span className="text-white font-bold text-xl">AI</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            AI Agent System
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your digital twin assistant
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">
            <button
              onClick={handleOIDCLogin}
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Sign in with SSO
                </>
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              Secure authentication via IAM Identity Center
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};