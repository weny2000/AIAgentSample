import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskSubmissionForm } from '../WorkTaskSubmission';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../lib/api';

// Mock the auth store
jest.mock('../../../stores/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock the API
jest.mock('../../../lib/api');
const mockApi = api as jest.Mocked<typeof api>;

describe('TaskSubmissionForm - Core Functionality', () => {
  let queryClient: QueryClient;
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'developer',
    department: 'Engineering',
    team_id: 'team-1',
    clearance: 'standard',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      user: mockUser,
      token: 'mock-token',
      idToken: 'mock-id-token',
      refreshToken: 'mock-refresh-token',
      isLoading: false,
      sessionTimeout: null,
      login: jest.fn(),
      logout: jest.fn(),
      updateUser: jest.fn(),
      setLoading: jest.fn(),
      refreshTokens: jest.fn(),
      checkSession: jest.fn(),
      handleSessionExpired: jest.fn(),
      updateTokens: jest.fn(),
    });

    mockApi.submitWorkTask.mockResolvedValue({ taskId: 'task-123' });
    
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TaskSubmissionForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  describe('Form Rendering', () => {
    it('renders all required form fields', () => {
      renderComponent();

      expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/task description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/detailed task content/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit task/i })).toBeInTheDocument();
    });

    it('shows form title and description', () => {
      renderComponent();

      expect(screen.getByText('Submit Work Task')).toBeInTheDocument();
      expect(screen.getByText(/Provide detailed information about your work task/)).toBeInTheDocument();
    });

    it('has correct default values', () => {
      renderComponent();

      const prioritySelect = screen.getByLabelText(/priority/i) as HTMLSelectElement;
      expect(prioritySelect.value).toBe('medium');

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      expect(categorySelect.value).toBe('');
    });
  });

  describe('Form Validation', () => {
    it('shows validation errors for empty required fields', async () => {
      renderComponent();

      // First trigger validation by changing and clearing a field
      const titleInput = screen.getByLabelText(/task title/i);
      fireEvent.change(titleInput, { target: { value: 'test' } });
      fireEvent.change(titleInput, { target: { value: '' } });

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
        expect(screen.getByText('Description is required')).toBeInTheDocument();
        expect(screen.getByText('Task content is required')).toBeInTheDocument();
        expect(screen.getByText('Category is required')).toBeInTheDocument();
      });
    });

    it('validates minimum character requirements', async () => {
      renderComponent();

      const titleInput = screen.getByLabelText(/task title/i);
      const descriptionInput = screen.getByLabelText(/task description/i);
      const contentInput = screen.getByLabelText(/detailed task content/i);

      fireEvent.change(titleInput, { target: { value: 'Hi' } });
      fireEvent.change(descriptionInput, { target: { value: 'Short' } });
      fireEvent.change(contentInput, { target: { value: 'Too short' } });

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
        expect(screen.getByText('Description must be at least 10 characters')).toBeInTheDocument();
        expect(screen.getByText('Task content must be at least 20 characters')).toBeInTheDocument();
      });
    });

    it('shows character count for text fields', () => {
      renderComponent();

      expect(screen.getByText('0/100 characters')).toBeInTheDocument(); // Title
      expect(screen.getByText('0/500 characters')).toBeInTheDocument(); // Description
      expect(screen.getByText('0/50,000 characters')).toBeInTheDocument(); // Content
    });

    it('disables submit button when form is invalid', () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('submits form with valid data', async () => {
      renderComponent();

      // Fill in all required fields
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Test Task Title' } });
      fireEvent.change(screen.getByLabelText(/task description/i), { target: { value: 'This is a test description with enough characters' } });
      fireEvent.change(screen.getByLabelText(/detailed task content/i), { target: { value: 'This is detailed content for the test task with enough characters' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Development' } });
      fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'high' } });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /submit task/i });
        expect(submitButton).not.toBeDisabled();
      });

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.submitWorkTask).toHaveBeenCalledWith({
          title: 'Test Task Title',
          description: 'This is a test description with enough characters',
          content: 'This is detailed content for the test task with enough characters',
          priority: 'high',
          category: 'Development',
          tags: [],
        });
      });

      expect(mockOnSubmit).toHaveBeenCalledWith('task-123');
    });

    it('shows success message after successful submission', async () => {
      renderComponent();

      // Fill in required fields
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Test Task Title' } });
      fireEvent.change(screen.getByLabelText(/task description/i), { target: { value: 'This is a test description with enough characters' } });
      fireEvent.change(screen.getByLabelText(/detailed task content/i), { target: { value: 'This is detailed content for the test task with enough characters' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Development' } });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /submit task/i });
        expect(submitButton).not.toBeDisabled();
      });

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Task Submitted Successfully')).toBeInTheDocument();
        expect(screen.getByText(/Your task has been submitted for AI analysis/)).toBeInTheDocument();
      });
    });

    it('shows error message on submission failure', async () => {
      mockApi.submitWorkTask.mockRejectedValue(new Error('Submission failed'));
      
      renderComponent();

      // Fill in required fields
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Test Task Title' } });
      fireEvent.change(screen.getByLabelText(/task description/i), { target: { value: 'This is a test description with enough characters' } });
      fireEvent.change(screen.getByLabelText(/detailed task content/i), { target: { value: 'This is detailed content for the test task with enough characters' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Development' } });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /submit task/i });
        expect(submitButton).not.toBeDisabled();
      });

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument();
        expect(screen.getByText('Submission failed')).toBeInTheDocument();
      });
    });

    it('prevents submission when user is not authenticated', async () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: false,
        user: null,
        token: null,
        idToken: null,
        refreshToken: null,
        isLoading: false,
        sessionTimeout: null,
        login: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        setLoading: jest.fn(),
        refreshTokens: jest.fn(),
        checkSession: jest.fn(),
        handleSessionExpired: jest.fn(),
        updateTokens: jest.fn(),
      });

      renderComponent();

      // Fill in required fields
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Test Task Title' } });
      fireEvent.change(screen.getByLabelText(/task description/i), { target: { value: 'This is a test description with enough characters' } });
      fireEvent.change(screen.getByLabelText(/detailed task content/i), { target: { value: 'This is detailed content for the test task with enough characters' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Development' } });

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You must be logged in to submit a task')).toBeInTheDocument();
      });

      expect(mockApi.submitWorkTask).not.toHaveBeenCalled();
    });
  });

  describe('Tag Management', () => {
    it('adds tags when Enter key is pressed', async () => {
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      fireEvent.change(tagInput, { target: { value: 'javascript' } });
      fireEvent.keyDown(tagInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('javascript')).toBeInTheDocument();
      });
    });

    it('adds tags when comma is pressed', async () => {
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      fireEvent.change(tagInput, { target: { value: 'react' } });
      fireEvent.keyDown(tagInput, { key: ',', code: 'Comma' });

      await waitFor(() => {
        expect(screen.getByText('react')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('calls onCancel when cancel button is clicked', () => {
      renderComponent();

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('hides cancel button when onCancel prop is not provided', () => {
      renderComponent({ onCancel: undefined });
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  describe('Priority and Category Selection', () => {
    it('updates priority when changed', async () => {
      renderComponent();

      const prioritySelect = screen.getByLabelText(/priority/i);
      fireEvent.change(prioritySelect, { target: { value: 'critical' } });

      await waitFor(() => {
        expect(screen.getByText('Critical Priority')).toBeInTheDocument();
      });
    });

    it('shows category badge when category is selected', async () => {
      renderComponent();

      const categorySelect = screen.getByLabelText(/category/i);
      fireEvent.change(categorySelect, { target: { value: 'Development' } });

      await waitFor(() => {
        // Look for the badge specifically, not just any text with "Development"
        const badges = screen.getAllByText('Development');
        expect(badges.length).toBeGreaterThan(1); // Should have both option and badge
      });
    });
  });
});