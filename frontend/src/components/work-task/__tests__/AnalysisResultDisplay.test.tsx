import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnalysisResultDisplay } from '../AnalysisResultDisplay';
import { TaskAnalysisResult, RelatedWorkgroup, KnowledgeReference } from '../../../types/work-task';

// Mock data for testing
const mockAnalysisResult: TaskAnalysisResult = {
  taskId: 'task-123',
  keyPoints: [
    'Implement user authentication system',
    'Design secure password storage mechanism',
    'Create user registration and login flows',
    'Implement session management',
    'Add password reset functionality'
  ],
  relatedWorkgroups: [
    {
      teamId: 'security-team',
      teamName: 'Security Team',
      relevanceScore: 0.95,
      reason: 'Authentication and security implementation requires security team expertise',
      contactInfo: 'security@company.com',
      expertise: ['Authentication', 'Security', 'Encryption', 'OAuth'],
      recommendedInvolvement: 'collaboration'
    },
    {
      teamId: 'frontend-team',
      teamName: 'Frontend Team',
      relevanceScore: 0.85,
      reason: 'User interface components for login and registration forms',
      contactInfo: 'frontend@company.com',
      expertise: ['React', 'UI/UX', 'Forms', 'Validation'],
      recommendedInvolvement: 'consultation'
    }
  ],
  knowledgeReferences: [
    {
      sourceId: 'auth-policy-001',
      sourceType: 'policy',
      title: 'Authentication Security Policy',
      snippet: 'All user authentication must implement multi-factor authentication and secure password storage using bcrypt with minimum 12 rounds...',
      relevanceScore: 0.92,
      url: 'https://docs.company.com/policies/auth-security',
      lastUpdated: new Date('2024-01-15')
    },
    {
      sourceId: 'auth-best-practices',
      sourceType: 'best_practice',
      title: 'Authentication Implementation Best Practices',
      snippet: 'When implementing authentication systems, consider using established libraries like Passport.js for Node.js applications...',
      relevanceScore: 0.88,
      url: 'https://docs.company.com/best-practices/auth'
    }
  ],
  todoList: [],
  riskAssessment: {
    overallRisk: 'medium',
    riskFactors: [
      {
        type: 'security',
        description: 'Authentication systems are high-value targets for attackers',
        probability: 0.7,
        impact: 0.9,
        mitigation: 'Implement comprehensive security testing and code review'
      },
      {
        type: 'technical',
        description: 'Complex integration with existing user management systems',
        probability: 0.6,
        impact: 0.7,
        mitigation: 'Create detailed integration plan and conduct thorough testing'
      }
    ],
    mitigationStrategies: [
      'Implement comprehensive security testing',
      'Conduct thorough code reviews',
      'Use established authentication libraries',
      'Implement proper session management'
    ],
    impactAnalysis: {
      affectedSystems: ['User Management', 'Frontend Application', 'API Gateway'],
      affectedTeams: ['Security Team', 'Frontend Team', 'Backend Team'],
      businessImpact: 'significant',
      technicalComplexity: 'high',
      resourceRequirements: []
    }
  },
  recommendations: [
    'Use established authentication libraries like Passport.js',
    'Implement proper session management with secure cookies',
    'Add comprehensive logging for security events',
    'Consider implementing OAuth2 for third-party integrations'
  ],
  estimatedEffort: {
    totalHours: 120,
    breakdown: [],
    confidence: 0.8,
    assumptions: []
  },
  dependencies: [
    {
      dependencyId: 'dep-001',
      type: 'requires',
      description: 'User database schema must be finalized before implementation',
      targetTask: 'database-design',
      criticality: 'high'
    }
  ],
  complianceChecks: []
};

const mockProps = {
  analysisResult: mockAnalysisResult,
  onUpdateTodo: jest.fn(),
  onSubmitDeliverable: jest.fn(),
  onContactWorkgroup: jest.fn(),
  onViewKnowledgeReference: jest.fn(),
};

describe('AnalysisResultDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the component with analysis results', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Task Analysis Results')).toBeInTheDocument();
    expect(screen.getByText('AI-powered analysis and recommendations for your work task')).toBeInTheDocument();
    expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
  });

  it('displays key points section with correct count', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Key Points (5)')).toBeInTheDocument();
    expect(screen.getByText('Implement user authentication system')).toBeInTheDocument();
    expect(screen.getByText('Design secure password storage mechanism')).toBeInTheDocument();
  });

  it('displays related workgroups with correct information', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Related Workgroups (2)')).toBeInTheDocument();
    expect(screen.getByText('Security Team')).toBeInTheDocument();
    expect(screen.getByText('Frontend Team')).toBeInTheDocument();
    expect(screen.getByText('95% match')).toBeInTheDocument();
    expect(screen.getByText('85% match')).toBeInTheDocument();
  });

  it('displays knowledge references with correct information', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Knowledge Base References (2)')).toBeInTheDocument();
    expect(screen.getByText('Authentication Security Policy')).toBeInTheDocument();
    expect(screen.getByText('Authentication Implementation Best Practices')).toBeInTheDocument();
  });

  it('displays risk assessment with correct overall risk level', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
    expect(screen.getByText('medium risk')).toBeInTheDocument();
  });

  it('allows toggling of expandable sections', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Key points should be expanded by default
    expect(screen.getByText('Implement user authentication system')).toBeInTheDocument();
    
    // Click to collapse key points
    const keyPointsButton = screen.getByRole('button', { name: /Key Points/ });
    fireEvent.click(keyPointsButton);
    
    // Key points should be hidden
    expect(screen.queryByText('Implement user authentication system')).not.toBeInTheDocument();
    
    // Click to expand again
    fireEvent.click(keyPointsButton);
    expect(screen.getByText('Implement user authentication system')).toBeInTheDocument();
  });

  it('calls onContactWorkgroup when contact button is clicked', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    const contactButtons = screen.getAllByText('Contact');
    fireEvent.click(contactButtons[0]);
    
    expect(mockProps.onContactWorkgroup).toHaveBeenCalledWith(mockAnalysisResult.relatedWorkgroups[0]);
  });

  it('calls onViewKnowledgeReference when preview button is clicked', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);
    
    expect(mockProps.onViewKnowledgeReference).toHaveBeenCalledWith(mockAnalysisResult.knowledgeReferences[0]);
  });

  it('opens knowledge reference modal when preview is clicked', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);
    
    // Modal should be visible - there should be 2 instances now (one in list, one in modal)
    const titleElements = screen.getAllByText('Authentication Security Policy');
    expect(titleElements).toHaveLength(2);
    const snippetElements = screen.getAllByText(/All user authentication must implement/);
    expect(snippetElements).toHaveLength(2);
  });

  it('closes knowledge reference modal when close button is clicked', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Open modal
    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);
    
    // Close modal
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(closeButton);
    
    // Modal should be closed (only one instance of title should remain)
    const titleElements = screen.getAllByText('Authentication Security Policy');
    expect(titleElements).toHaveLength(1);
  });

  it('displays risk factors with correct icons and information', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Risk assessment section should be expanded by default
    expect(screen.getByText('Risk Factors')).toBeInTheDocument();
    expect(screen.getByText('Authentication systems are high-value targets for attackers')).toBeInTheDocument();
    expect(screen.getByText('Complex integration with existing user management systems')).toBeInTheDocument();
  });

  it('displays mitigation strategies', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Risk assessment section should be expanded by default
    expect(screen.getByText('Mitigation Strategies')).toBeInTheDocument();
    expect(screen.getByText('Implement comprehensive security testing')).toBeInTheDocument();
    expect(screen.getByText('Use established authentication libraries')).toBeInTheDocument();
  });

  it('displays recommendations when section is expanded', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Recommendations should be collapsed by default
    expect(screen.queryByText('Use established authentication libraries like Passport.js')).not.toBeInTheDocument();
    
    // Expand recommendations section
    const recommendationsButton = screen.getByRole('button', { name: /Recommendations/ });
    fireEvent.click(recommendationsButton);
    
    expect(screen.getByText('Use established authentication libraries like Passport.js')).toBeInTheDocument();
    expect(screen.getByText('Add comprehensive logging for security events')).toBeInTheDocument();
  });

  it('displays dependencies when present', async () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    // Dependencies should be collapsed by default
    expect(screen.queryByText('User database schema must be finalized before implementation')).not.toBeInTheDocument();
    
    // Expand dependencies section
    const dependenciesButton = screen.getByRole('button', { name: /Dependencies/ });
    fireEvent.click(dependenciesButton);
    
    expect(screen.getByText('User database schema must be finalized before implementation')).toBeInTheDocument();
    expect(screen.getByText('Target Task: database-design')).toBeInTheDocument();
  });

  it('formats relevance scores correctly', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('95% match')).toBeInTheDocument();
    expect(screen.getByText('85% match')).toBeInTheDocument();
    expect(screen.getByText('92% relevance')).toBeInTheDocument();
    expect(screen.getByText('88% relevance')).toBeInTheDocument();
  });

  it('displays workgroup expertise tags', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('UI/UX')).toBeInTheDocument();
  });

  it('displays involvement type badges with correct styling', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    const collaborationBadge = screen.getByText('collaboration');
    const consultationBadge = screen.getByText('consultation');
    
    expect(collaborationBadge).toHaveClass('text-purple-600');
    expect(consultationBadge).toHaveClass('text-blue-600');
  });

  it('opens external links in new tab', () => {
    render(<AnalysisResultDisplay {...mockProps} />);
    
    const openButtons = screen.getAllByText('Open');
    const firstOpenButton = openButtons[0];
    
    expect(firstOpenButton.closest('a')).toHaveAttribute('target', '_blank');
    expect(firstOpenButton.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('handles missing optional data gracefully', () => {
    const minimalAnalysisResult: TaskAnalysisResult = {
      ...mockAnalysisResult,
      knowledgeReferences: [
        {
          sourceId: 'minimal-ref',
          sourceType: 'documentation',
          title: 'Minimal Reference',
          snippet: 'Basic information',
          relevanceScore: 0.5,
          // No URL or lastUpdated
        }
      ],
      relatedWorkgroups: [
        {
          teamId: 'minimal-team',
          teamName: 'Minimal Team',
          relevanceScore: 0.6,
          reason: 'Basic reason',
          expertise: [],
          recommendedInvolvement: 'notification',
          // No contactInfo
        }
      ],
      dependencies: [], // No dependencies
    };

    render(<AnalysisResultDisplay {...mockProps} analysisResult={minimalAnalysisResult} />);
    
    expect(screen.getByText('Minimal Reference')).toBeInTheDocument();
    expect(screen.getByText('Minimal Team')).toBeInTheDocument();
    expect(screen.queryByText('Dependencies')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <AnalysisResultDisplay {...mockProps} className="custom-class" />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });
});