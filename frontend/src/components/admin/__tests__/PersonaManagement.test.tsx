import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersonaManagement } from '../PersonaManagement';

// Mock the API hooks
jest.mock('../../../hooks/useApi', () => ({
  usePersonas: () => ({
    data: [
      {
        id: '1',
        name: 'Test Persona',
        description: 'Test Description',
        style: 'Test Style',
        leadership_style: 'collaborative',
        team_id: 'team-1',
        rules: ['rule1', 'rule2'],
        escalation_criteria: [],
        decision_patterns: {},
        created_by: 'user-1',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
      },
    ],
    isLoading: false,
  }),
  useCreatePersona: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdatePersona: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeletePersona: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
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

describe('PersonaManagement', () => {
  it('renders persona management interface', () => {
    renderWithQueryClient(<PersonaManagement />);
    
    expect(screen.getByText('Persona Management')).toBeInTheDocument();
    expect(screen.getByText('Create Persona')).toBeInTheDocument();
  });

  it('displays personas in grid layout', () => {
    renderWithQueryClient(<PersonaManagement />);
    
    expect(screen.getByText('Test Persona')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
    expect(screen.getByText('team-1')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each persona', () => {
    renderWithQueryClient(<PersonaManagement />);
    
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });
});