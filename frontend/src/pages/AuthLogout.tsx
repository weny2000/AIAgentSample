import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

export const AuthLogout: React.FC = () => {
  const navigate = useNavigate();
  const { logout, setLoading } = useAuthStore();
  const { addNotification } = useAppStore();

  useEffect(() => {
    const handleLogout = async () => {
      setLoading(true);
      
      try {
        await logout();
        
        addNotification({
          type: 'success',
          title: 'Logged Out',
          message: 'You have been successfully logged out.',
        });

        // Redirect to login
        navigate('/login', { replace: true });
      } catch (error) {
        console.error('Logout error:', error);
        
        addNotification({
          type: 'error',
          title: 'Logout Error',
          message: 'There was an issue logging you out. Please try again.',
        });

        // Still redirect to login even if logout had issues
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    handleLogout();
  }, [logout, navigate, setLoading, addNotification]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-blue-100 rounded-full mb-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
          Signing Out
        </h2>
        <p className="text-gray-600 text-center">
          Please wait while we securely log you out of your session.
        </p>
      </div>
    </div>
  );
};