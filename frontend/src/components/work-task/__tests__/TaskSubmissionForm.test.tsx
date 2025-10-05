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

// Mock file for testing
const createMockFile = (name: string, size: number, type: string) => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('TaskSubmissionForm', () => {
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
    it('renders all form fields', () => {
      renderComponent();

      expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/task description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/detailed task content/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
      expect(screen.getByText(/attachments/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit task/i })).toBeInTheDocument();
    });

    it('renders priority options correctly', () => {
      renderComponent();

      const prioritySelect = screen.getByLabelText(/priority/i);
      expect(prioritySelect).toHaveValue('medium'); // default value

      fireEvent.click(prioritySelect);
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('renders category options correctly', () => {
      renderComponent();

      const categorySelect = screen.getByLabelText(/category/i);
      fireEvent.click(categorySelect);
      
      expect(screen.getByText('Development')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
      expect(screen.getByText('Documentation')).toBeInTheDocument();
      expect(screen.getByText('Testing')).toBeInTheDocument();
    });

    it('shows cancel button when onCancel prop is provided', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('hides cancel button when onCancel prop is not provided', () => {
      renderComponent({ onCancel: undefined });
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows validation errors for required fields', async () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      
      // Try to submit empty form
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

      fireEvent.change(titleInput, { target: { value: 'Hi' } }); // Too short
      fireEvent.change(descriptionInput, { target: { value: 'Short' } }); // Too short
      fireEvent.change(contentInput, { target: { value: 'Too short content' } }); // Too short

      await waitFor(() => {
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
        expect(screen.getByText('Description must be at least 10 characters')).toBeInTheDocument();
        expect(screen.getByText('Task content must be at least 20 characters')).toBeInTheDocument();
      });
    });

    it('validates maximum character limits', async () => {
      renderComponent();

      const titleInput = screen.getByLabelText(/task title/i);
      const longTitle = 'a'.repeat(101); // Too long

      fireEvent.change(titleInput, { target: { value: longTitle } });

      await waitFor(() => {
        expect(screen.getByText('Title must be less than 100 characters')).toBeInTheDocument();
      });
    });

    it('shows character count for text fields', () => {
      renderComponent();

      expect(screen.getByText('0/100 characters')).toBeInTheDocument(); // Title
      expect(screen.getByText('0/500 characters')).toBeInTheDocument(); // Description
      expect(screen.getByText('0/50,000 characters')).toBeInTheDocument(); // Content
    });

    it('disables submit button when form is invalid', async () => {
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when form is valid', async () => {
      renderComponent();

      // Fill in all required fields
      fireEvent.change(screen.getByLabelText(/task title/i), { target: { value: 'Valid Task Title' } });
      fireEvent.change(screen.getByLabelText(/task description/i), { target: { value: 'This is a valid description with enough characters' } });
      fireEvent.change(screen.getByLabelText(/detailed task content/i), { target: { value: 'This is detailed task content with enough characters to pass validation' } });
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Development' } });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /submit task/i });
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Tag Management', () => {
    it('adds tags when Enter key is pressed', async () => {
      const user = userEvent.setup();
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      await user.type(tagInput, 'javascript');
      await user.keyboard('{Enter}');

      expect(screen.getByText('javascript')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('adds tags when comma is pressed', async () => {
      const user = userEvent.setup();
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      await user.type(tagInput, 'react,');

      expect(screen.getByText('react')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('removes tags when remove button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      await user.type(tagInput, 'test-tag');
      await user.keyboard('{Enter}');

      expect(screen.getByText('test-tag')).toBeInTheDocument();

      const removeButton = screen.getByRole('button', { name: '' }); // Remove button
      await user.click(removeButton);

      expect(screen.queryByText('test-tag')).not.toBeInTheDocument();
    });

    it('prevents duplicate tags', async () => {
      const user = userEvent.setup();
      renderComponent();

      const tagInput = screen.getByLabelText(/tags/i);
      
      // Add first tag
      await user.type(tagInput, 'duplicate');
      await user.keyboard('{Enter}');
      
      // Try to add same tag again
      await user.type(tagInput, 'duplicate');
      await user.keyboard('{Enter}');

      const tags = screen.getAllByText('duplicate');
      expect(tags).toHaveLength(1); // Should only have one instance
    });
  });

  describe('File Upload', () => {
    it('displays uploaded files', async () => {
      const user = userEvent.setup();
      renderComponent();

      const file = createMockFile('test.txt', 1024, 'text/plain');
      const fileInput = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
        expect(screen.getByText('(0.00 MB)')).toBeInTheDocument();
      });
    });

    it('removes files when remove button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();

      const file = createMockFile('test.txt', 1024, 'text/plain');
      const fileInput = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      const removeButtons = screen.getAllByRole('button');
      const fileRemoveButton = removeButtons.find(button => 
        button.querySelector('svg') && !button.textContent?.includes('Submit')
      );
      
      if (fileRemoveButton) {
        await user.click(fileRemoveButton);
      }

      await waitFor(() => {
        expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
      });
    });

    it('validates file size', async () => {
      const user = userEvent.setup();
      renderComponent();

      const largeFile = createMockFile('large.txt', 11 * 1024 * 1024, 'text/plain'); // 11MB
      const fileInput = screen.getByRole('button').querySelector('input[type="file"]') as HTMLInputElement;

      await user.upload(fileInput, largeFile);

      await waitFor(() => {
        expect(screen.getByText(/Invalid files: large.txt/)).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('submits form with valid data', async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill in all required fields
      await user.type(screen.getByLabelText(/task title/i), 'Test Task');
      await user.type(screen.getByLabelText(/task description/i), 'This is a test description');
      await user.type(screen.getByLabelText(/detailed task content/i), 'This is detailed content for the test task');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');
      await user.selectOptions(screen.getByLabelText(/priority/i), 'high');

      // Add a tag
      const tagInput = screen.getByLabelText(/tags/i);
      await user.type(tagInput, 'test');
      await user.keyboard('{Enter}');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockApi.submitWorkTask).toHaveBeenCalledWith({
          title: 'Test Task',
          description: 'This is a test description',
          content: 'This is detailed content for the test task',
          priority: 'high',
          category: 'Development',
          tags: ['test'],
        });
      });

      expect(mockOnSubmit).toHaveBeenCalledWith('task-123');
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      
      // Make API call hang
      mockApi.submitWorkTask.mockImplementation(() => new Promise(() => {}));
      
      renderComponent();

      // Fill in required fields
      await user.type(screen.getByLabelText(/task title/i), 'Test Task');
      await user.type(screen.getByLabelText(/task description/i), 'This is a test description');
      await user.type(screen.getByLabelText(/detailed task content/i), 'This is detailed content for the test task');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Submitting...')).toBeInTheDocument();
        expect(submitButton).toBeDisabled();
      });
    });

    it('shows error message on submission failure', async () => {
      const user = userEvent.setup();
      
      mockApi.submitWorkTask.mockRejectedValue(new Error('Submission failed'));
      
      renderComponent();

      // Fill in required fields
      await user.type(screen.getByLabelText(/task title/i), 'Test Task');
      await user.type(screen.getByLabelText(/task description/i), 'This is a test description');
      await user.type(screen.getByLabelText(/detailed task content/i), 'This is detailed content for the test task');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Submission Failed')).toBeInTheDocument();
        expect(screen.getByText('Submission failed')).toBeInTheDocument();
      });
    });

    it('shows success message on successful submission', async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill in required fields
      await user.type(screen.getByLabelText(/task title/i), 'Test Task');
      await user.type(screen.getByLabelText(/task description/i), 'This is a test description');
      await user.type(screen.getByLabelText(/detailed task content/i), 'This is detailed content for the test task');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Task Submitted Successfully')).toBeInTheDocument();
        expect(screen.getByText(/Your task has been submitted for AI analysis/)).toBeInTheDocument();
      });
    });

    it('prevents submission when user is not authenticated', async () => {
      const user = userEvent.setup();
      
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
      await user.type(screen.getByLabelText(/task title/i), 'Test Task');
      await user.type(screen.getByLabelText(/task description/i), 'This is a test description');
      await user.type(screen.getByLabelText(/detailed task content/i), 'This is detailed content for the test task');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You must be logged in to submit a task')).toBeInTheDocument();
      });

      expect(mockApi.submitWorkTask).not.toHaveBeenCalled();
    });
  });

  describe('Form Reset', () => {
    it('resets form after successful submission', async () => {
      const user = userEvent.setup();
      renderComponent();

      // Fill in fields
      const titleInput = screen.getByLabelText(/task title/i);
      const descriptionInput = screen.getByLabelText(/task description/i);
      const contentInput = screen.getByLabelText(/detailed task content/i);
      const categorySelect = screen.getByLabelText(/category/i);

      await user.type(titleInput, 'Test Task');
      await user.type(descriptionInput, 'Test description');
      await user.type(contentInput, 'Test content for the task');
      await user.selectOptions(categorySelect, 'Development');

      const submitButton = screen.getByRole('button', { name: /submit task/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Task Submitted Successfully')).toBeInTheDocument();
      });

      // Check that form is reset
      expect(titleInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
      expect(contentInput).toHaveValue('');
      expect(categorySelect).toHaveValue('');
    });
  });

  describe('Cancel Functionality', () => {
    it('calls onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Priority and Category Display', () => {
    it('displays priority badge correctly', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.selectOptions(screen.getByLabelText(/priority/i), 'critical');
      await user.selectOptions(screen.getByLabelText(/category/i), 'Development');

      expect(screen.getByText('Critical Priority')).toBeInTheDocument();
      expect(screen.getByText('Development')).toBeInTheDocument();
    });
  });
});