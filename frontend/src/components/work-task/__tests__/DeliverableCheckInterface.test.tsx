import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliverableCheckInterface } from '../DeliverableCheckInterface';
import {
  DeliverableInfo,
  QualityAssessmentResult
} from '../../../types/work-task';

// Mock data
const mockDeliverables: DeliverableInfo[] = [
  {
    id: 'del-1',
    fileName: 'test-document.pdf',
    fileType: 'application/pdf',
    fileSize: 1024000,
    status: 'approved',
    submittedAt: new Date('2024-01-15T10:30:00Z'),
    submittedBy: 'test@example.com',
    version: 1,
    qualityAssessment: {
      id: 'qa-1',
      deliverableId: 'del-1',
      assessedAt: new Date('2024-01-15T11:00:00Z'),
      assessedBy: 'quality-engine',
      overallScore: 85,
      qualityDimensions: [
        {
          name: 'completeness',
          type: 'completeness',
          score: 90,
          weight: 0.5,
          criteria: []
        },
        {
          name: 'accuracy',
          type: 'accuracy',
          score: 80,
          weight: 0.5,
          criteria: []
        }
      ],
      improvementSuggestions: [
        {
          id: 'imp-1',
          category: 'minor',
          title: 'Test Improvement',
          description: 'Test improvement description',
          impact: 'low',
          effort: 'low',
          priority: 5,
          relatedCriteria: ['completeness']
        }
      ],
      qualityGates: [
        {
          name: 'Minimum Quality Score',
          type: 'mandatory',
          threshold: 75,
          currentScore: 85,
          status: 'passed',
          blocking: true,
          description: 'Overall quality score must be at least 75%'
        }
      ]
    }
  }
];

const mockQualityAssessmentResult: QualityAssessmentResult = {
  id: 'qa-new',
  deliverableId: 'del-1',
  assessedAt: new Date(),
  assessedBy: 'quality-engine',
  overallScore: 88,
  qualityDimensions: [
    {
      name: 'completeness',
      type: 'completeness',
      score: 90,
      weight: 0.5,
      criteria: []
    }
  ],
  improvementSuggestions: [],
  qualityGates: []
};

// Mock handlers
const mockOnDeliverableSubmit = jest.fn();
const mockOnQualityCheck = jest.fn();
const mockOnDeliverableDelete = jest.fn();

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('DeliverableCheckInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnQualityCheck.mockResolvedValue(mockQualityAssessmentResult);
  });

  const defaultProps = {
    todoId: 'todo-1',
    deliverables: mockDeliverables,
    onDeliverableSubmit: mockOnDeliverableSubmit,
    onQualityCheck: mockOnQualityCheck,
    onDeliverableDelete: mockOnDeliverableDelete
  };

  it('renders the component with header and upload section', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    
    expect(screen.getByText('Deliverable Check Interface')).toBeInTheDocument();
    expect(screen.getByText('Upload deliverables and perform quality assessments')).toBeInTheDocument();
    expect(screen.getByText('Upload New Deliverable')).toBeInTheDocument();
    expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
  });

  it('displays existing deliverables', () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    
    expect(screen.getByText('Existing Deliverables')).toBeInTheDocument();
    expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getByText('Score: 85/100')).toBeInTheDocument();
  });

  it('handles quality check execution', async () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    
    const qualityCheckButton = screen.getByText('Quality Check');
    fireEvent.click(qualityCheckButton);
    
    expect(mockOnQualityCheck).toHaveBeenCalledWith({
      deliverableId: 'del-1',
      qualityStandards: undefined,
      priority: 'medium'
    });
  });

  it('expands deliverable details when Details button is clicked', async () => {
    render(<DeliverableCheckInterface {...defaultProps} />);
    
    const detailsButton = screen.getByText('Details');
    fireEvent.click(detailsButton);
    
    await waitFor(() => {
      expect(screen.getByText('Quality Assessment')).toBeInTheDocument();
      expect(screen.getByText('Quality Gates')).toBeInTheDocument();
      expect(screen.getByText('Improvement Suggestions')).toBeInTheDocument();
    });
  });

  it('renders empty state when no deliverables exist', () => {
    render(<DeliverableCheckInterface {...defaultProps} deliverables={[]} />);
    
    expect(screen.queryByText('Existing Deliverables')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <DeliverableCheckInterface {...defaultProps} className="custom-class" />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });
});