import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

interface SessionTimeoutWarningProps {
  warningThreshold?: number; // seconds before expiry to show warning
}

export const SessionTimeoutWarning: React.FC<SessionTimeoutWarningProps> = ({ 
  warningThreshold = 300 // 5 minutes default
}) => {
  const { token, sessionTimeout, refreshTokens, logout } = useAuthStore();
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    if (!token || !sessionTimeout) return;

    const checkSessionTimeout = () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = sessionTimeout - currentTime;

      if (timeUntilExpiry <= 0) {
        // Session has expired
        setShowWarning(false);
        logout();
        return;
      }

      if (timeUntilExpiry <= warningThreshold && !showWarning) {
        setShowWarning(true);
      }

      setTimeLeft(timeUntilExpiry);
    };

    // Check immediately
    checkSessionTimeout();

    // Set up interval to check every 30 seconds
    const interval = setInterval(checkSessionTimeout, 30000);

    return () => clearInterval(interval);
  }, [token, sessionTimeout, warningThreshold, showWarning, logout]);

  const handleExtendSession = async () => {
    setIsExtending(true);
    try {
      await refreshTokens();
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to extend session:', error);
      // If refresh fails, logout
      logout();
    } finally {
      setIsExtending(false);
    }
  };

  const handleLogout = () => {
    setShowWarning(false);
    logout();
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              Session Expiring Soon
            </h3>
          </div>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Your session will expire in:
          </p>
          <div className="text-2xl font-mono font-bold text-red-600 text-center py-2">
            {formatTime(timeLeft)}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Would you like to extend your session or log out now?
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleExtendSession}
            disabled={isExtending}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtending ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Extending...
              </div>
            ) : (
              'Extend Session'
            )}
          </button>
          
          <button
            onClick={handleLogout}
            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};