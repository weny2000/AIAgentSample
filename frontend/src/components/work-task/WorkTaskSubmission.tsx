import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { LoadingSpinner } from '../LoadingSpinner';
import { TaskSubmissionRequest } from '../../types/work-task';
import { api } from '../../lib/api';

interface TaskSubmissionFormProps {
  onSubmit?: (taskId: string) => void;
  onCancel?: () => void;
  className?: string;
}

interface FormData {
  title: string;
  description: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  tags: string[];
  attachments: File[];
}

interface ValidationErrors {
  title?: string;
  description?: string;
  content?: string;
  category?: string;
  attachments?: string;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: 'critical', label: 'Critical', color: 'text-red-600 bg-red-50 border-red-200' },
] as const;

const CATEGORY_OPTIONS = [
  'Development',
  'Research',
  'Documentation',
  'Testing',
  'Review',
  'Deployment',
  'Maintenance',
  'Security',
  'Performance',
  'Integration',
  'Other',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  '.txt', '.md', '.pdf', '.docx', '.doc', '.xlsx', '.xls', 
  '.pptx', '.ppt', '.png', '.jpg', '.jpeg', '.gif', '.zip'
];

export const TaskSubmissionForm: React.FC<TaskSubmissionFormProps> = ({
  onSubmit,
  onCancel,
  className = '',
}) => {
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState('');

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    content: '',
    priority: 'medium',
    category: '',
    tags: [],
    attachments: [],
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  // Real-time validation
  useEffect(() => {
    if (!isDirty) return;

    const newErrors: ValidationErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    } else if (formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    if (!formData.content.trim()) {
      newErrors.content = 'Task content is required';
    } else if (formData.content.length < 20) {
      newErrors.content = 'Task content must be at least 20 characters';
    } else if (formData.content.length > 50000) {
      newErrors.content = 'Task content must be less than 50,000 characters';
    }

    if (!formData.category) {
      newErrors.category = 'Category is required';
    }

    // File validation
    if (formData.attachments.length > 0) {
      const invalidFiles = formData.attachments.filter(file => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase();
        return !ALLOWED_FILE_TYPES.includes(extension) || file.size > MAX_FILE_SIZE;
      });

      if (invalidFiles.length > 0) {
        newErrors.attachments = `Invalid files: ${invalidFiles.map(f => f.name).join(', ')}`;
      }
    }

    setErrors(newErrors);
  }, [formData, isDirty]);

  const submitMutation = useMutation({
    mutationFn: async (data: TaskSubmissionRequest) => {
      return api.submitWorkTask(data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries(['work-tasks']);
      onSubmit?.(response.taskId);
      resetForm();
    },
    onError: (error: Error) => {
      console.error('Task submission failed:', error);
    },
  });

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      content: '',
      priority: 'medium',
      category: '',
      tags: [],
      attachments: [],
    });
    setErrors({});
    setIsDirty(false);
    setTagInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleInputChange = useCallback((field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleInputChange('attachments', [...formData.attachments, ...files]);
  }, [formData.attachments, handleInputChange]);

  const removeFile = useCallback((index: number) => {
    const newAttachments = formData.attachments.filter((_, i) => i !== index);
    handleInputChange('attachments', newAttachments);
  }, [formData.attachments, handleInputChange]);

  const handleTagInput = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const tag = tagInput.trim();
      if (tag && !formData.tags.includes(tag)) {
        handleInputChange('tags', [...formData.tags, tag]);
        setTagInput('');
      }
    }
  }, [tagInput, formData.tags, handleInputChange]);

  const removeTag = useCallback((tagToRemove: string) => {
    handleInputChange('tags', formData.tags.filter(tag => tag !== tagToRemove));
  }, [formData.tags, handleInputChange]);

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    setIsDirty(true);

    if (Object.keys(errors).length > 0) {
      return;
    }

    if (!isAuthenticated || !user) {
      setErrors({ title: 'You must be logged in to submit a task' });
      return;
    }

    const submissionData: TaskSubmissionRequest = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      content: formData.content.trim(),
      priority: formData.priority,
      category: formData.category,
      tags: formData.tags,
    };

    submitMutation.mutate(submissionData);
  }, [formData, errors, isAuthenticated, user, submitMutation]);

  const isFormValid = Object.keys(errors).length === 0 && 
    formData.title.trim() && 
    formData.description.trim() && 
    formData.content.trim() && 
    formData.category;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Submit Work Task</h2>
        <p className="text-sm text-gray-600 mt-1">
          Provide detailed information about your work task for AI-powered analysis and planning.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Task Title *
          </label>
          <input
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.title ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter a clear, concise title for your task"
            maxLength={100}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {formData.title.length}/100 characters
          </p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Task Description *
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={3}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.description ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Provide a brief overview of what needs to be accomplished"
            maxLength={500}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {formData.description.length}/500 characters
          </p>
        </div>

        {/* Priority and Category Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority */}
          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
              Priority
            </label>
            <select
              id="priority"
              value={formData.priority}
              onChange={(e) => handleInputChange('priority', e.target.value as FormData['priority'])}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {PRIORITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.category ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a category</option>
              {CATEGORY_OPTIONS.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-sm text-red-600">{errors.category}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
            Detailed Task Content *
          </label>
          <textarea
            id="content"
            value={formData.content}
            onChange={(e) => handleInputChange('content', e.target.value)}
            rows={8}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.content ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Provide comprehensive details about the task including:
• Objectives and goals
• Requirements and constraints
• Expected deliverables
• Technical specifications
• Dependencies and assumptions
• Success criteria"
            maxLength={50000}
          />
          {errors.content && (
            <p className="mt-1 text-sm text-red-600">{errors.content}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {formData.content.length}/50,000 characters
          </p>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="space-y-2">
            <input
              type="text"
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInput}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Type tags and press Enter or comma to add"
            />
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none"
                    >
                      <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M1 1l6 6m0-6L1 7" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Add relevant tags to help categorize and search your task
          </p>
        </div>

        {/* File Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attachments
          </label>
          <div className="space-y-3">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">
                    Max 10MB per file. Supported: {ALLOWED_FILE_TYPES.join(', ')}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept={ALLOWED_FILE_TYPES.join(',')}
                />
              </label>
            </div>

            {formData.attachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Attached Files:</h4>
                {formData.attachments.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700 focus:outline-none"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errors.attachments && (
              <p className="text-sm text-red-600">{errors.attachments}</p>
            )}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            {/* Priority Badge */}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.color
            }`}>
              {PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.label} Priority
            </span>
            
            {formData.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                {formData.category}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            )}
            
            <button
              type="submit"
              disabled={!isFormValid || submitMutation.isLoading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitMutation.isLoading && (
                <LoadingSpinner size="sm" className="mr-2 text-white" />
              )}
              {submitMutation.isLoading ? 'Submitting...' : 'Submit Task'}
            </button>
          </div>
        </div>

        {/* Submission Status */}
        {submitMutation.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Submission Failed</h3>
                <p className="mt-1 text-sm text-red-700">
                  {submitMutation.error?.message || 'An error occurred while submitting your task. Please try again.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {submitMutation.isSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Task Submitted Successfully</h3>
                <p className="mt-1 text-sm text-green-700">
                  Your task has been submitted for AI analysis. You'll receive detailed analysis results shortly.
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};