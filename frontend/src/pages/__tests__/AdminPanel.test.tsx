import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPanel } from '../AdminPanel';

// Mock all the admin components
jest.mock('../../components/admin/PersonaManagement', () => ({
  PersonaManagement: () => <div>Persona Management Component</div>,
}));

jest.mock('../../components/admin/RulesEngineConfig', () => ({
  RulesEngineConfig: () => <div>Rules Engine Component</div>,
}));

jest.mock('../../components/admin/UserManagement', () => ({
  UserManagement: () => <div>User Management Component</div>,
}));

jest.mock('../../components/admin/AuditLogs', () => ({
  AuditLogs: () => <div>Audit Logs Component</div>,
}));

jest.mock('../../components/admin/SystemSettings', () => ({
  SystemSettings: () => <div>System Settings Component</div>,
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithQueryClient = (component: React.ReactElement) => {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('AdminPanel', () => {
  it('renders admin panel with navigation', () => {
    renderWithQueryClient(<AdminPanel />);
    
    expect(screen.getAllByText('Admin Panel')).toHaveLength(2); // Sidebar and main content
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rules engine/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /audit logs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /system settings/i })).toBeInTheDocument();
  });

  it('shows overview by default', () => {
    renderWithQueryClient(<AdminPanel />);
    
    expect(screen.getByText('Manage system configuration, personas, policies, and user settings.')).toBeInTheDocument();
  });

  it('navigates to persona management when clicked', () => {
    renderWithQueryClient(<AdminPanel />);
    
    const personasButton = screen.getByRole('button', { name: /personas/i });
    fireEvent.click(personasButton);
    
    expect(screen.getByText('Persona Management Component')).toBeInTheDocument();
  });

  it('navigates to rules engine when clicked', () => {
    renderWithQueryClient(<AdminPanel />);
    
    const rulesButton = screen.getByRole('button', { name: /rules engine/i });
    fireEvent.click(rulesButton);
    
    expect(screen.getByText('Rules Engine Component')).toBeInTheDocument();
  });

  it('navigates to user management when clicked', () => {
    renderWithQueryClient(<AdminPanel />);
    
    const usersButton = screen.getByRole('button', { name: /users/i });
    fireEvent.click(usersButton);
    
    expect(screen.getByText('User Management Component')).toBeInTheDocument();
  });

  it('navigates to audit logs when clicked', () => {
    renderWithQueryClient(<AdminPanel />);
    
    const auditButton = screen.getByRole('button', { name: /audit logs/i });
    fireEvent.click(auditButton);
    
    expect(screen.getByText('Audit Logs Component')).toBeInTheDocument();
  });

  it('navigates to system settings when clicked', () => {
    renderWithQueryClient(<AdminPanel />);
    
    const settingsButton = screen.getByRole('button', { name: /system settings/i });
    fireEvent.click(settingsButton);
    
    expect(screen.getByText('System Settings Component')).toBeInTheDocument();
  });
});