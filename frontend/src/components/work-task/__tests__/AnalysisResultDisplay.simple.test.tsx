import React from 'react';
import { render, screen } from '@testing-library/react';
import { AnalysisResultDisplay } from '../AnalysisResultDisplay';
import { TaskAnalysisResult } from '../../../types/work-task';

// Simple mock data for basic testing
const mockAnalysisResult: TaskAnalysisResult = {
  taskId: 'test-task',
  keyPoints: ['Key point 1', 'Key point 2'],
  relatedWorkgroups: [
    {
      teamId: 'team-1',
      teamName: 'Test Team',
      relevanceScore: 0.8,
      reason: 'Test reason',
      expertise: ['Testing'],
      recommendedInvolvement: 'consultation'
    }
  ],
  knowledgeReferences: [
    {
      sourceId: 'ref-1',
      sourceType: 'documentation',
      title: 'Test Reference',
      snippet: 'Test snippet',
      relevanceScore: 0.7
    }
  ],
  todoList: [],
  riskAssessment: {
    overallRisk: 'low',
    riskFactors: [],
    mitigationStrategies: [],
    impactAnalysis: {
      affectedSystems: [],
      affectedTeams: [],
      businessImpact: 'minimal',
      technicalComplexity: 'low',
      resourceRequirements: []
    }
  },
  recommendations: ['Test recommendation'],
  estimatedEffort: {
    totalHours: 10,
    breakdown: [],
    confidence: 0.8,
    assumptions: []
  },
  dependencies: [],
  complianceChecks: []
};

describe('AnalysisResultDisplay - Simple Tests', () => {
  it('renders without crashing', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Task Analysis Results')).toBeInTheDocument();
  });

  it('displays key points', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Key Points (2)')).toBeInTheDocument();
    expect(screen.getByText('Key point 1')).toBeInTheDocument();
    expect(screen.getByText('Key point 2')).toBeInTheDocument();
  });

  it('displays workgroups', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Related Workgroups (1)')).toBeInTheDocument();
    expect(screen.getByText('Test Team')).toBeInTheDocument();
  });

  it('displays knowledge references', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Knowledge Base References (1)')).toBeInTheDocument();
    expect(screen.getByText('Test Reference')).toBeInTheDocument();
  });

  it('displays risk assessment', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
    expect(screen.getByText('low risk')).toBeInTheDocument();
  });

  it('displays recommendations', () => {
    render(<AnalysisResultDisplay analysisResult={mockAnalysisResult} />);
    expect(screen.getByText('Recommendations (1)')).toBeInTheDocument();
  });
});