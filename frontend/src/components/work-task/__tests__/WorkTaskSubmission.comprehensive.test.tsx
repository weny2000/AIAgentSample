/**
 * Comprehensive tests for WorkTaskSubmission component
 * Tests form validation, submission, file uploads, and error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkTaskSubmission } from '../WorkTaskSubmission';
import '@testing-library/jest-dom';

// Mock API calls
const mockSubmitTask = jest.fn();
jest.mock('../../../lib/api', () => ({
  submitWorkTask: (...args: any[]) => mockSubmitTask(...args)
}));

describe('WorkTaskSubmission Component - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render all form fields', () => {
      render(<WorkTaskSubmission />);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('should render priority options', () => {
      render(<WorkTaskSubmission />);

      const prioritySelect = screen.getByLabelText(/priority/i);
      expect(prioritySelect).toBeInTheDocument();
      
      // Check if priority options exist
      fireEvent.click(prioritySelect);
      expect(screen.getByText(/low/i)).toBeInTheDocument();
      expect(screen.getByText(/medium/i)).toBeInTheDocument();
      expect(screen.getByText(/high/i)).toBeInTheDocument();
      expect(screen.getByText(/critical/i)).toBeInTheDocument();
    });

    it('should render optional fields', () => {
      render(<WorkTaskSubmission />);

      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    });

    it('should render file upload section', () => {
      render(<WorkTaskSubmission />);

      expect(screen.getByText(/attachments/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when title is empty', async () => {
      render(<WorkTaskSubmission />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/title is required/i)).toBeInTheDocument();
      });
    });

    it('should show error when description is empty', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      await userEvent.type(titleInput, 'Test Task');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      });
    });

    it('should show error when content is empty', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      
      await userEvent.type(titleInput, 'Test Task');
      await userEvent.type(descriptionInput, 'Test Description');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/content is required/i)).toBeInTheDocument();
      });
    });

    it('should validate title length', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      const longTitle = 'a'.repeat(201); // Exceeds max length
      
      await userEvent.type(titleInput, longTitle);

      await waitFor(() => {
        expect(screen.getByText(/title is too long/i)).toBeInTheDocument();
      });
    });

    it('should validate content length', async () => {
      render(<WorkTaskSubmission />);

      const contentInput = screen.getByLabelText(/content/i);
      const longContent = 'a'.repeat(50001); // Exceeds max length
      
      await userEvent.type(contentInput, longContent);

      await waitFor(() => {
        expect(screen.getByText(/content is too long/i)).toBeInTheDocument();
      });
    });

    it('should clear validation errors when input is corrected', async () => {
      render(<WorkTaskSubmission />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/title is required/i)).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/title/i);
      await userEvent.type(titleInput, 'Valid Title');

      await waitFor(() => {
        expect(screen.queryByText(/title is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      mockSubmitTask.mockResolvedValue({ taskId: 'task-123', status: 'submitted' });

      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const contentInput = screen.getByLabelText(/content/i);
      const prioritySelect = screen.getByLabelText(/priority/i);

      await userEvent.type(titleInput, 'Implement Authentication');
      await userEvent.type(descriptionInput, 'Add OAuth2 authentication');
      await userEvent.type(contentInput, 'Detailed requirements for authentication...');
      await userEvent.selectOptions(prioritySelect, 'high');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith({
          title: 'Implement Authentication',
          description: 'Add OAuth2 authentication',
          content: 'Detailed requirements for authentication...',
          priority: 'high',
          category: undefined,
          tags: [],
          attachments: []
        });
      });
    });

    it('should submit form with optional fields', async () => {
      mockSubmitTask.mockResolvedValue({ taskId: 'task-123', status: 'submitted' });

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test Task');
      await userEvent.type(screen.getByLabelText(/description/i), 'Description');
      await userEvent.type(screen.getByLabelText(/content/i), 'Content');
      await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'medium');
      await userEvent.type(screen.getByLabelText(/category/i), 'development');
      await userEvent.type(screen.getByLabelText(/tags/i), 'security, authentication');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'development',
            tags: expect.arrayContaining(['security', 'authentication'])
          })
        );
      });
    });

    it('should show loading state during submission', async () => {
      mockSubmitTask.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/submitting/i)).toBeInTheDocument();
        expect(submitButton).toBeDisabled();
      });
    });

    it('should show success message after submission', async () => {
      mockSubmitTask.mockResolvedValue({ taskId: 'task-123', status: 'submitted' });

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/task submitted successfully/i)).toBeInTheDocument();
      });
    });

    it('should reset form after successful submission', async () => {
      mockSubmitTask.mockResolvedValue({ taskId: 'task-123', status: 'submitted' });

      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      const descriptionInput = screen.getByLabelText(/description/i) as HTMLInputElement;
      const contentInput = screen.getByLabelText(/content/i) as HTMLInputElement;

      await userEvent.type(titleInput, 'Test');
      await userEvent.type(descriptionInput, 'Test');
      await userEvent.type(contentInput, 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(titleInput.value).toBe('');
        expect(descriptionInput.value).toBe('');
        expect(contentInput.value).toBe('');
      });
    });
  });

  describe('File Upload', () => {
    it('should handle file selection', async () => {
      render(<WorkTaskSubmission />);

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/upload/i);

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/test.pdf/i)).toBeInTheDocument();
      });
    });

    it('should handle multiple file uploads', async () => {
      render(<WorkTaskSubmission />);

      const files = [
        new File(['content1'], 'file1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'file2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      ];

      const fileInput = screen.getByLabelText(/upload/i);
      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        expect(screen.getByText(/file1.pdf/i)).toBeInTheDocument();
        expect(screen.getByText(/file2.docx/i)).toBeInTheDocument();
      });
    });

    it('should validate file size', async () => {
      render(<WorkTaskSubmission />);

      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/upload/i);

      await userEvent.upload(fileInput, largeFile);

      await waitFor(() => {
        expect(screen.getByText(/file size exceeds limit/i)).toBeInTheDocument();
      });
    });

    it('should validate file type', async () => {
      render(<WorkTaskSubmission />);

      const invalidFile = new File(['content'], 'script.exe', { type: 'application/x-msdownload' });
      const fileInput = screen.getByLabelText(/upload/i);

      await userEvent.upload(fileInput, invalidFile);

      await waitFor(() => {
        expect(screen.getByText(/file type not allowed/i)).toBeInTheDocument();
      });
    });

    it('should allow removing uploaded files', async () => {
      render(<WorkTaskSubmission />);

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/upload/i);

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/test.pdf/i)).toBeInTheDocument();
      });

      const removeButton = screen.getByRole('button', { name: /remove/i });
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText(/test.pdf/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display API error message', async () => {
      mockSubmitTask.mockRejectedValue(new Error('Network error'));

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('should handle validation errors from API', async () => {
      mockSubmitTask.mockRejectedValue({
        response: {
          status: 400,
          data: {
            validationErrors: [
              { field: 'title', message: 'Title already exists' }
            ]
          }
        }
      });

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Duplicate Title');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/title already exists/i)).toBeInTheDocument();
      });
    });

    it('should handle unauthorized errors', async () => {
      mockSubmitTask.mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      });

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      mockSubmitTask
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ taskId: 'task-123', status: 'submitted' });

      render(<WorkTaskSubmission />);

      await userEvent.type(screen.getByLabelText(/title/i), 'Test');
      await userEvent.type(screen.getByLabelText(/description/i), 'Test');
      await userEvent.type(screen.getByLabelText(/content/i), 'Test');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Retry
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/task submitted successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<WorkTaskSubmission />);

      expect(screen.getByLabelText(/title/i)).toHaveAttribute('aria-label');
      expect(screen.getByLabelText(/description/i)).toHaveAttribute('aria-label');
      expect(screen.getByLabelText(/content/i)).toHaveAttribute('aria-label');
    });

    it('should associate error messages with inputs', async () => {
      render(<WorkTaskSubmission />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const titleInput = screen.getByLabelText(/title/i);
        expect(titleInput).toHaveAttribute('aria-invalid', 'true');
        expect(titleInput).toHaveAttribute('aria-describedby');
      });
    });

    it('should be keyboard navigable', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      titleInput.focus();
      expect(titleInput).toHaveFocus();

      // Tab to next field
      await userEvent.tab();
      const descriptionInput = screen.getByLabelText(/description/i);
      expect(descriptionInput).toHaveFocus();
    });
  });

  describe('Real-time Validation', () => {
    it('should show character count for title', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      await userEvent.type(titleInput, 'Test Title');

      await waitFor(() => {
        expect(screen.getByText(/10 \/ 200/i)).toBeInTheDocument();
      });
    });

    it('should show character count for content', async () => {
      render(<WorkTaskSubmission />);

      const contentInput = screen.getByLabelText(/content/i);
      await userEvent.type(contentInput, 'Test content');

      await waitFor(() => {
        expect(screen.getByText(/12 \/ 50000/i)).toBeInTheDocument();
      });
    });

    it('should validate as user types', async () => {
      render(<WorkTaskSubmission />);

      const titleInput = screen.getByLabelText(/title/i);
      await userEvent.type(titleInput, 'ab'); // Too short

      await waitFor(() => {
        expect(screen.getByText(/title must be at least 3 characters/i)).toBeInTheDocument();
      });

      await userEvent.type(titleInput, 'c'); // Now valid

      await waitFor(() => {
        expect(screen.queryByText(/title must be at least 3 characters/i)).not.toBeInTheDocument();
      });
    });
  });
});
