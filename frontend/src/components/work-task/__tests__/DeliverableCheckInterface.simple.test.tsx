import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeliverableCheckInterface } from '../DeliverableCheckInterface';

// Mock handlers
const mockOnDeliverableSubmit = jest.fn();
const mockOnQualityCheck = jest.fn();

describe('DeliverableCheckInterface - Simple Tests', () => {
  const defaultProps = {
    todoId: 'todo-1',
    deliverables: [],
    onDeliverableSubmit: mockOnDeliverableSubmit,
    onQualityCheck: mockOnQualityCheck
  };

  it('renders without crashing', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    expect(screen.getByText('Deliverable Check Interface')).toBeInTheDocument();
  });

  it('displays upload section', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    expect(screen.getByText('Upload New Deliverable')).toBeInTheDocument();
    expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
  });

  it('displays quality standards checkboxes', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    expect(screen.getByText('Quality Check Standards')).toBeInTheDocument();
    expect(screen.getByText('completeness')).toBeInTheDocument();
    expect(screen.getByText('accuracy')).toBeInTheDocument();
    expect(screen.getByText('consistency')).toBeInTheDocument();
    expect(screen.getByText('usability')).toBeInTheDocument();
    expect(screen.getByText('maintainability')).toBeInTheDocument();
    expect(screen.getByText('performance')).toBeInTheDocument();
  });

  it('does not show existing deliverables section when empty', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    expect(screen.queryByText('Existing Deliverables')).not.toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    const { container } = render(
      <DeliverableCheckInterface {...defaultProps} className="test-class" />
    );
    expect(container.firstChild).toHaveClass('test-class');
  });
});