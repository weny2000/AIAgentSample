import React from 'react';
import { render, screen } from '@testing-library/react';
import { TodoListManager } from '../TodoListManager';
import { TodoItem } from '../../../types/work-task';

// Simple mock data
const simpleTodos: TodoItem[] = [
  {
    id: 'todo-1',
    title: 'Test Todo',
    description: 'A simple test todo',
    priority: 'medium',
    estimatedHours: 4,
    dependencies: [],
    category: 'development',
    status: 'pending',
    relatedWorkgroups: [],
  },
];

// Mock functions
const mockOnStatusUpdate = jest.fn();
const mockOnDeliverableSubmit = jest.fn();
const mockOnQualityCheck = jest.fn();

describe('TodoListManager - Simple Tests', () => {
  it('renders without crashing', () => {
    render(
      <TodoListManager
        taskId="test-task"
        todos={simpleTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('Todo List')).toBeInTheDocument();
  });

  it('displays todo title and description', () => {
    render(
      <TodoListManager
        taskId="test-task"
        todos={simpleTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('Test Todo')).toBeInTheDocument();
    expect(screen.getByText('A simple test todo')).toBeInTheDocument();
  });

  it('shows empty state when no todos provided', () => {
    render(
      <TodoListManager
        taskId="test-task"
        todos={[]}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('No todos yet')).toBeInTheDocument();
  });

  it('displays category icon', () => {
    render(
      <TodoListManager
        taskId="test-task"
        todos={simpleTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('💻')).toBeInTheDocument(); // development icon
  });

  it('shows status badge', () => {
    render(
      <TodoListManager
        taskId="test-task"
        todos={simpleTodos}
        onStatusUpdate={mockOnStatusUpdate}
        onDeliverableSubmit={mockOnDeliverableSubmit}
        onQualityCheck={mockOnQualityCheck}
      />
    );

    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});