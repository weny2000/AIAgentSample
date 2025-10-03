import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

interface ProtectedRouteProps {
  requiredRole?: string;
  requiredClearance?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  requiredRole, 
  requiredClearance,
  children 
}) => {
  const { isAuthenticated, isLoading, user, checkSession, handleSessionExpired } = useAuthStore();
  const { addNotification } = useAppStore();
  const location = useLocation();
  const [sessionChecked, setSessionChecked] = useState(false);

  // Check session validity on mount and periodically
  useEffect(() => {
    const validateSession = async () => {
      if (isAuthenticated && user) {
        try {
          const isValid = await checkSession();
          if (!isValid) {
            handleSessionExpired();
            return;
          }
        } catch (error) {
          console.error('Session validation failed:', error);
          handleSessionExpired();
          return;
        }
      }
      setSessionChecked(true);
    };

    validateSession();
  }, [isAuthenticated, user, checkSession, handleSessionExpired]);

  // Set up session monitoring
  useEffect(() => {
    const handleTokenRefresh = () => {
      console.log('Token refreshed automatically');
    };

    const handleSessionExpiry = () => {
      addNotification({
        type: 'warning',
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again.',
      });
      handleSessionExpired();
    };

    window.addEventListener('tokenRefresh', handleTokenRefresh as EventListener);
    window.addEventListener('sessionExpired', handleSessionExpiry);

    return () => {
      window.removeEventListener('tokenRefresh', handleTokenRefresh as EventListener);
      window.removeEventListener('sessionExpired', handleSessionExpiry);
    };
  }, [addNotification, handleSessionExpired]);

  // Show loading while checking session
  if (isLoading || !sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying your session...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (requiredRole && user.role !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-4a2 2 0 00-2-2H6a2 2 0 00-2 2v4a2 2 0 002 2zM12 9V7a4 4 0 00-8 0v2" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have the required role ({requiredRole}) to access this page.
          </p>
          <p className="text-sm text-gray-500">
            Your current role: {user.role}
          </p>
        </div>
      </div>
    );
  }

  // Check clearance-based access
  if (requiredClearance && !hasRequiredClearance(user.clearance, requiredClearance)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Insufficient Clearance</h2>
          <p className="text-gray-600 mb-4">
            You don't have the required clearance level ({requiredClearance}) to access this page.
          </p>
          <p className="text-sm text-gray-500">
            Your current clearance: {user.clearance}
          </p>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

// Helper function to check clearance levels
function hasRequiredClearance(userClearance: string, requiredClearance: string): boolean {
  const clearanceLevels = ['standard', 'elevated', 'admin'];
  const userLevel = clearanceLevels.indexOf(userClearance);
  const requiredLevel = clearanceLevels.indexOf(requiredClearance);
  
  return userLevel >= requiredLevel;
}