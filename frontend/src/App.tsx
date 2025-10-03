import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ArtifactUpload } from './pages/ArtifactUpload';
import { CheckStatus } from './pages/CheckStatus';
import { AgentQuery } from './pages/AgentQuery';
import { AdminPanel } from './pages/AdminPanel';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { AuthLogout } from './pages/AuthLogout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning';
import { useAuthStore } from './stores/authStore';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            {/* Public routes */}
            <Route 
              path="/login" 
              element={
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
              } 
            />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/logout" element={<AuthLogout />} />
            
            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="upload" element={<ArtifactUpload />} />
                <Route path="status/:jobId?" element={<CheckStatus />} />
                <Route path="query" element={<AgentQuery />} />
                
                {/* Admin routes with role-based access */}
                <Route 
                  path="admin" 
                  element={
                    <ProtectedRoute requiredClearance="admin">
                      <AdminPanel />
                    </ProtectedRoute>
                  } 
                />
              </Route>
            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          
          {/* Session timeout warning - only show when authenticated */}
          {isAuthenticated && <SessionTimeoutWarning />}
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;