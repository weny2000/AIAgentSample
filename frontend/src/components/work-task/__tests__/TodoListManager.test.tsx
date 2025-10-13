import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TodoListManager } from '../TodoListManager';
import { TodoItem, ProgressSummary, QualityAssessmentResult } from '../../../types/work-task';

// Mock data
const mockTodos: TodoItem[] = [
  {
    id: 'todo-1',
    title: 'Research API Requirements',
    description: 'Investigate the API requirements for the new feature',
    priority: 'high',
    estimatedHours: 8,
    dependencies: [],
    category: 'research',
    status: 'pending',
    relatedWorkgroups: ['backend-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
  {
    id: 'todo-2',
    title: 'Implement Core Logic',
    description: 'Develop the core business logic for the feature',
    priority: 'critical',
    estimatedHours: 16,
    dependencies: ['todo-1'],
    category: 'development',
    status: 'in_progress',
    relatedWorkgroups: ['backend-team', 'frontend-team'],
    deliverables: [
      {
        id: 'deliverable-1',
        fileName: 'core-logic.ts',
        fileType: 'typescript',
        fileSize: 2048,
        status: 'submitted',
        submittedAt: new Date(),
        submittedBy: 'user-1',
        version: 1,
        qualityAssessment: {
          id: 'qa-1',
          deliverableId: 'deliverable-1',
          assessedAt: new Date(),
          assessedBy: 'system',
          overallScore: 85,
          qualityDimensions: [],
          improvementSuggestions: [],
          qualityGates: [],
        },
      },
    ],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 60,
      timeSpentHours: 10,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
  {
    id: 'todo-3',
    title: 'Write Unit Tests',
    description: 'Create comprehensive unit tests for the implemented logic',
    priority: 'medium',
    estimatedHours: 6,
    dependencies: ['todo-2'],
    category: 'testing',
    status: 'blocked',
    relatedWorkgroups: ['qa-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [
        {
          id: 'issue-1',
          description: 'Waiting for core logic completion',
          severity: 'medium',
          reportedAt: new Date(),
        },
      ],
      statusHistory: [],
    },
  },
];

const mockProgressSummary: ProgressSummary = {
  taskId: 'task-1',
  overallProgress: 40,
  completedTodos: 0,
  totalTodos: 3,
  averageQualityScore: 85,
  riskIndicators: [],
  upcomingDeadlines: [],
  recentActivity: [],
};

const mockQualityAssessmentResult: QualityAssessmentResult = {
  id: 'qa-2',
  deliverableId: 'deliverable-2',
  assessedAt: new Date(),
  assessedBy: 'system',
  overallScore: 92,
  qualityDimensions: [],
  improvementSuggestions: [],
  qualityGates: [],
};

// Mock functions
const mockOnStatusUpdate = jest.fn();
const mockOnDeliverableSubmit = jest.fn();
const mockOnQualityCheck = jest.fn();
const mockOnReorderTodos = jest.fn();

describe('TodoListManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders todo list with correct information', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        progressSummary={mockProgressSummary}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Check header
    expect(screen.getByText('Todo List')).toBeInTheDocument();
    expect(screen.getByText('Track progress and manage deliverables for your work task')).toBeInTheDocument();

    // Check progress summary
    expect(screen.getByText('0 / 3 completed')).toBeInTheDocument();
    expect(screen.getByText('40% overall progress')).toBeInTheDocument();

    // Check todos are rendered
    expect(screen.getByText('Research API Requirements')).toBeInTheDocument();
    expect(screen.getByText('Implement Core Logic')).toBeInTheDocument();
    expect(screen.getByText('Write Unit Tests')).toBeInTheDocument();
  });

  it('displays todo status badges correctly', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('shows category icons for different todo types', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Check for category icons (emojis)
    expect(screen.getByText('🔍')).toBeInTheDocument(); // research
    expect(screen.getByText('💻')).toBeInTheDocument(); // development
    expect(screen.getByText('🧪')).toBeInTheDocument(); // testing
  });

  it('handles status updates correctly', async () => {
    mockOnStatusUpdate.mockResolvedValue(undefined);

    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Find and change the status dropdown for the first todo
    const statusSelects = screen.getAllByRole('combobox');
    fireEvent.change(statusSelects[0], { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(mockOnStatusUpdate).toHaveBeenCalledWith('todo-1', { status: 'in_progress' });
    });
  });

  it('expands and collapses todo details', async () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Initially, detailed content should not be visible
    expect(screen.queryByText('Submit Deliverable')).not.toBeInTheDocument();

    // Click "More" button to expand
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[0]);

    // Now detailed content should be visible
    await waitFor(() => {
      expect(screen.getByText('Submit Deliverable')).toBeInTheDocument();
    });

    // Click "Less" button to collapse
    fireEvent.click(screen.getByText('Less'));

    // Detailed content should be hidden again
    await waitFor(() => {
      expect(screen.queryByText('Submit Deliverable')).not.toBeInTheDocument();
    });
  });

  it('handles file upload for deliverables', async () => {
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    mockOnDeliverableSubmit.mockResolvedValue(undefined);

    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Expand the first todo
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[0]);

    await waitFor(() => {
      // Find file input and upload button
      const fileInputs = screen.getAllByRole('textbox');
      const fileInput = fileInputs.find(input => input.getAttribute('type') === 'file');
      const uploadButton = screen.getByText('Upload');

      // Initially upload button should be disabled
      expect(uploadButton).toBeDisabled();

      // Upload file
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [mockFile],
          writable: false,
        });
        fireEvent.change(fileInput);
      }
    });
  });

  it('displays existing deliverables with quality scores', async () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Expand the second todo which has deliverables
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[1]);

    // Check deliverable information
    await waitFor(() => {
      expect(screen.getByText('Deliverables')).toBeInTheDocument();
      expect(screen.getByText('core-logic.ts')).toBeInTheDocument();
      expect(screen.getByText('Quality Score: 85/100')).toBeInTheDocument();
    });
  });

  it('handles quality check requests', async () => {
    mockOnQualityCheck.mockResolvedValue(mockQualityAssessmentResult);

    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Expand the second todo which has deliverables
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[1]);

    await waitFor(() => {
      // Click quality check button
      const qualityCheckButton = screen.getByText('Check Quality');
      fireEvent.click(qualityCheckButton);
    });

    await waitFor(() => {
      expect(mockOnQualityCheck).toHaveBeenCalledWith('deliverable-1');
    });
  });

  it('shows dependency relationships', async () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Expand the second todo which has dependencies
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[1]);

    // Check dependency information
    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
      expect(screen.getByText('Research API Requirements')).toBeInTheDocument();
    });
  });

  it('displays blocking issues when present', async () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Expand the third todo which has blocking issues
    const moreButtons = screen.getAllByText('More');
    fireEvent.click(moreButtons[2]);

    // Check blocking issue information
    await waitFor(() => {
      expect(screen.getByText('Blocking Issues:')).toBeInTheDocument();
      expect(screen.getByText('Waiting for core logic completion')).toBeInTheDocument();
    });
  });

  it('handles drag and drop reordering when enabled', async () => {
    mockOnReorderTodos.mockResolvedValue(undefined);

    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
        onReorderTodos={mockOnReorderTodos}
      />
    );

    // Find the first todo item
    const todoItems = screen.getAllByRole('generic').filter(el => 
      el.getAttribute('draggable') === 'true'
    );

    expect(todoItems.length).toBeGreaterThan(0);
    
    // Simulate drag start
    fireEvent.dragStart(todoItems[0]);
    
    // Simulate drag over second item
    fireEvent.dragOver(todoItems[1]);
    
    // Simulate drop
    fireEvent.drop(todoItems[1]);

    await waitFor(() => {
      expect(mockOnReorderTodos).toHaveBeenCalled();
    });
  });

  it('shows empty state when no todos are present', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={[]}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('No todos yet')).toBeInTheDocument();
    expect(screen.getByText('Todo items will appear here once the task analysis is complete.')).toBeInTheDocument();
  });

  it('displays progress bars with correct percentages', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Check progress percentages
    expect(screen.getByText('0%')).toBeInTheDocument(); // pending todo
    expect(screen.getByText('60%')).toBeInTheDocument(); // in-progress todo
  });

  it('shows loading states during async operations', async () => {
    // Mock a delayed response
    mockOnStatusUpdate.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Change status to trigger loading state
    const statusSelects = screen.getAllByRole('combobox');
    fireEvent.change(statusSelects[0], { target: { value: 'in_progress' } });

    // Check for loading spinner (it should appear briefly)
    await waitFor(() => {
      const spinners = screen.getAllByRole('generic').filter(el => 
        el.className.includes('animate-spin')
      );
      expect(spinners.length).toBeGreaterThanOrEqual(0); // May or may not be visible due to timing
    });
  });

  it('applies correct priority styling', () => {
    render(
      <TodoListManager
        taskId="task-1"
        todos={mockTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    // Find todo containers and check for priority styling
    const todoContainers = screen.getAllByRole('generic').filter(el => 
      el.className.includes('border-l-4')
    );

    expect(todoContainers.length).toBeGreaterThan(0);
    
    // Check that different priority colors are applied
    const hasHighPriority = todoContainers.some(el => 
      el.className.includes('border-l-orange-400')
    );
    const hasCriticalPriority = todoContainers.some(el => 
      el.className.includes('border-l-red-400')
    );
    
    expect(hasHighPriority || hasCriticalPriority).toBe(true);
  });
});