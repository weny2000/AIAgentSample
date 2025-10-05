import React, { useState } from 'react';
import { DeliverableCheckInterface } from '../components/work-task';
import {
  DeliverableInfo,
  QualityAssessmentResult,
  DeliverableSubmissionRequest,
  QualityCheckRequest,
  ValidationResult,
  QualityDimension,
  ImprovementSuggestion,
  QualityGate
} from '../types/work-task';

// Mock data for demonstration
const mockDeliverables: DeliverableInfo[] = [
  {
    id: 'del-1',
    fileName: 'user-authentication-spec.pdf',
    fileType: 'application/pdf',
    fileSize: 2048000, // 2MB
    status: 'approved',
    submittedAt: new Date('2024-01-15T10:30:00Z'),
    submittedBy: 'john.doe@company.com',
    version: 2,
    validationResult: {
      id: 'val-1',
      deliverableId: 'del-1',
      validatedAt: new Date('2024-01-15T11:00:00Z'),
      validatedBy: 'system',
      overallStatus: 'passed',
      validationChecks: [
        {
          id: 'check-1',
          name: 'Document Format',
          type: 'format',
          status: 'passed',
          score: 95,
          details: 'PDF format is valid and readable',
          evidence: []
        },
        {
          id: 'check-2',
          name: 'Content Completeness',
          type: 'content',
          status: 'passed',
          score: 88,
          details: 'All required sections are present',
          evidence: []
        },
        {
          id: 'check-3',
          name: 'Security Scan',
          type: 'security',
          status: 'passed',
          score: 100,
          details: 'No security issues detected',
          evidence: []
        }
      ],
      recommendations: [
        'Consider adding more detailed examples in section 3.2',
        'Include performance benchmarks for authentication flows'
      ],
      nextSteps: [
        'Ready for stakeholder review',
        'Schedule implementation planning meeting'
      ]
    },
    qualityAssessment: {
      id: 'qa-1',
      deliverableId: 'del-1',
      assessedAt: new Date('2024-01-15T11:15:00Z'),
      assessedBy: 'quality-engine',
      overallScore: 87,
      qualityDimensions: [
        {
          name: 'completeness',
          type: 'completeness',
          score: 90,
          weight: 0.25,
          criteria: [
            {
              name: 'All sections present',
              description: 'Document contains all required sections',
              score: 10,
              maxScore: 10,
              evidence: 'All 8 required sections found',
              automated: true
            }
          ]
        },
        {
          name: 'accuracy',
          type: 'accuracy',
          score: 85,
          weight: 0.25,
          criteria: [
            {
              name: 'Technical accuracy',
              description: 'Technical details are correct and up-to-date',
              score: 8,
              maxScore: 10,
              evidence: 'Minor inconsistencies in API version references',
              automated: false
            }
          ]
        },
        {
          name: 'consistency',
          type: 'consistency',
          score: 88,
          weight: 0.2,
          criteria: [
            {
              name: 'Formatting consistency',
              description: 'Consistent formatting throughout document',
              score: 9,
              maxScore: 10,
              evidence: 'Minor heading style variations',
              automated: true
            }
          ]
        },
        {
          name: 'usability',
          type: 'usability',
          score: 82,
          weight: 0.15,
          criteria: [
            {
              name: 'Readability',
              description: 'Document is easy to read and understand',
              score: 8,
              maxScore: 10,
              evidence: 'Some technical jargon could be simplified',
              automated: false
            }
          ]
        },
        {
          name: 'maintainability',
          type: 'maintainability',
          score: 90,
          weight: 0.1,
          criteria: [
            {
              name: 'Version control',
              description: 'Document has proper version control information',
              score: 10,
              maxScore: 10,
              evidence: 'Version history and change log present',
              automated: true
            }
          ]
        },
        {
          name: 'performance',
          type: 'performance',
          score: 85,
          weight: 0.05,
          criteria: [
            {
              name: 'Load time',
              description: 'Document loads quickly',
              score: 9,
              maxScore: 10,
              evidence: 'PDF loads in under 2 seconds',
              automated: true
            }
          ]
        }
      ],
      improvementSuggestions: [
        {
          id: 'imp-1',
          category: 'major',
          title: 'Standardize API Version References',
          description: 'Update all API version references to use the latest v2.1 specification consistently throughout the document.',
          impact: 'medium',
          effort: 'low',
          priority: 8,
          relatedCriteria: ['accuracy'],
          example: 'Replace "API v2.0" references with "API v2.1" in sections 4.2 and 5.3'
        },
        {
          id: 'imp-2',
          category: 'minor',
          title: 'Improve Technical Glossary',
          description: 'Add definitions for technical terms to improve accessibility for non-technical stakeholders.',
          impact: 'low',
          effort: 'medium',
          priority: 6,
          relatedCriteria: ['usability'],
          example: 'Add glossary entries for "JWT", "OAuth 2.0", and "SAML"'
        },
        {
          id: 'imp-3',
          category: 'enhancement',
          title: 'Add Performance Benchmarks',
          description: 'Include performance benchmarks and SLA requirements for authentication flows.',
          impact: 'high',
          effort: 'medium',
          priority: 7,
          relatedCriteria: ['completeness'],
          example: 'Add section 6.4 with response time requirements: login < 500ms, token refresh < 200ms'
        }
      ],
      qualityGates: [
        {
          name: 'Minimum Quality Score',
          type: 'mandatory',
          threshold: 75,
          currentScore: 87,
          status: 'passed',
          blocking: true,
          description: 'Overall quality score must be at least 75%'
        },
        {
          name: 'Security Validation',
          type: 'mandatory',
          threshold: 95,
          currentScore: 100,
          status: 'passed',
          blocking: true,
          description: 'Security validation must pass with 95% or higher'
        },
        {
          name: 'Completeness Check',
          type: 'recommended',
          threshold: 85,
          currentScore: 90,
          status: 'passed',
          blocking: false,
          description: 'Document completeness should be 85% or higher'
        }
      ]
    }
  },
  {
    id: 'del-2',
    fileName: 'database-schema.sql',
    fileType: 'text/sql',
    fileSize: 512000, // 512KB
    status: 'needs_revision',
    submittedAt: new Date('2024-01-14T14:20:00Z'),
    submittedBy: 'jane.smith@company.com',
    version: 1,
    validationResult: {
      id: 'val-2',
      deliverableId: 'del-2',
      validatedAt: new Date('2024-01-14T14:45:00Z'),
      validatedBy: 'system',
      overallStatus: 'warning',
      validationChecks: [
        {
          id: 'check-4',
          name: 'SQL Syntax',
          type: 'format',
          status: 'passed',
          score: 100,
          details: 'SQL syntax is valid',
          evidence: []
        },
        {
          id: 'check-5',
          name: 'Naming Conventions',
          type: 'compliance',
          status: 'warning',
          score: 70,
          details: 'Some table names do not follow company naming conventions',
          evidence: []
        },
        {
          id: 'check-6',
          name: 'Index Optimization',
          type: 'technical',
          status: 'failed',
          score: 45,
          details: 'Missing indexes on frequently queried columns',
          evidence: []
        }
      ],
      recommendations: [
        'Add indexes on user_id and created_at columns',
        'Rename tables to follow snake_case convention',
        'Add foreign key constraints for data integrity'
      ],
      nextSteps: [
        'Address naming convention issues',
        'Add missing indexes',
        'Resubmit for validation'
      ]
    },
    qualityAssessment: {
      id: 'qa-2',
      deliverableId: 'del-2',
      assessedAt: new Date('2024-01-14T15:00:00Z'),
      assessedBy: 'quality-engine',
      overallScore: 68,
      qualityDimensions: [
        {
          name: 'completeness',
          type: 'completeness',
          score: 75,
          weight: 0.25,
          criteria: [
            {
              name: 'All tables defined',
              description: 'All required tables are present',
              score: 8,
              maxScore: 10,
              evidence: 'Missing audit_log table',
              automated: true
            }
          ]
        },
        {
          name: 'accuracy',
          type: 'accuracy',
          score: 80,
          weight: 0.25,
          criteria: [
            {
              name: 'Data types',
              description: 'Appropriate data types used',
              score: 8,
              maxScore: 10,
              evidence: 'Most data types are appropriate',
              automated: true
            }
          ]
        },
        {
          name: 'consistency',
          type: 'consistency',
          score: 55,
          weight: 0.2,
          criteria: [
            {
              name: 'Naming conventions',
              description: 'Consistent naming throughout schema',
              score: 5,
              maxScore: 10,
              evidence: 'Mixed camelCase and snake_case usage',
              automated: true
            }
          ]
        },
        {
          name: 'performance',
          type: 'performance',
          score: 45,
          weight: 0.3,
          criteria: [
            {
              name: 'Index optimization',
              description: 'Proper indexes for query performance',
              score: 4,
              maxScore: 10,
              evidence: 'Missing indexes on key columns',
              automated: true
            }
          ]
        }
      ],
      improvementSuggestions: [
        {
          id: 'imp-4',
          category: 'critical',
          title: 'Add Missing Indexes',
          description: 'Add indexes on frequently queried columns to improve performance.',
          impact: 'high',
          effort: 'low',
          priority: 9,
          relatedCriteria: ['performance'],
          example: 'CREATE INDEX idx_users_email ON users(email); CREATE INDEX idx_orders_user_id ON orders(user_id);'
        },
        {
          id: 'imp-5',
          category: 'major',
          title: 'Standardize Naming Convention',
          description: 'Convert all table and column names to snake_case to follow company standards.',
          impact: 'medium',
          effort: 'medium',
          priority: 8,
          relatedCriteria: ['consistency'],
          example: 'Rename "userProfiles" to "user_profiles", "createdAt" to "created_at"'
        },
        {
          id: 'imp-6',
          category: 'major',
          title: 'Add Audit Log Table',
          description: 'Include audit_log table for compliance and tracking requirements.',
          impact: 'high',
          effort: 'medium',
          priority: 7,
          relatedCriteria: ['completeness'],
          example: 'CREATE TABLE audit_log (id, table_name, action, old_values, new_values, user_id, timestamp);'
        }
      ],
      qualityGates: [
        {
          name: 'Minimum Quality Score',
          type: 'mandatory',
          threshold: 75,
          currentScore: 68,
          status: 'failed',
          blocking: true,
          description: 'Overall quality score must be at least 75%'
        },
        {
          name: 'Performance Standards',
          type: 'mandatory',
          threshold: 70,
          currentScore: 45,
          status: 'failed',
          blocking: true,
          description: 'Performance score must meet minimum standards'
        },
        {
          name: 'Naming Compliance',
          type: 'recommended',
          threshold: 80,
          currentScore: 55,
          status: 'failed',
          blocking: false,
          description: 'Naming conventions should be followed consistently'
        }
      ]
    }
  }
];

export const DeliverableCheckDemo: React.FC = () => {
  const [deliverables, setDeliverables] = useState<DeliverableInfo[]>(mockDeliverables);
  const [notifications, setNotifications] = useState<string[]>([]);

  const addNotification = (message: string) => {
    setNotifications(prev => [...prev, message]);
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 5000);
  };

  const handleDeliverableSubmit = async (request: DeliverableSubmissionRequest) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newDeliverable: DeliverableInfo = {
      id: `del-${Date.now()}`,
      fileName: request.file.name,
      fileType: request.file.type,
      fileSize: request.file.size,
      status: 'submitted',
      submittedAt: new Date(),
      submittedBy: 'current.user@company.com',
      version: 1
    };
    
    setDeliverables(prev => [...prev, newDeliverable]);
    addNotification(`Successfully uploaded ${request.file.name}`);
  };

  const handleQualityCheck = async (request: QualityCheckRequest): Promise<QualityAssessmentResult> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Mock quality assessment result
    const mockResult: QualityAssessmentResult = {
      id: `qa-${Date.now()}`,
      deliverableId: request.deliverableId,
      assessedAt: new Date(),
      assessedBy: 'quality-engine',
      overallScore: Math.floor(Math.random() * 40) + 60, // Random score between 60-100
      qualityDimensions: [
        {
          name: 'completeness',
          type: 'completeness',
          score: Math.floor(Math.random() * 30) + 70,
          weight: 0.25,
          criteria: []
        },
        {
          name: 'accuracy',
          type: 'accuracy',
          score: Math.floor(Math.random() * 30) + 70,
          weight: 0.25,
          criteria: []
        }
      ],
      improvementSuggestions: [
        {
          id: `imp-${Date.now()}`,
          category: 'minor',
          title: 'Sample Improvement',
          description: 'This is a sample improvement suggestion generated for demo purposes.',
          impact: 'medium',
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
          currentScore: Math.floor(Math.random() * 40) + 60,
          status: Math.random() > 0.5 ? 'passed' : 'failed',
          blocking: true,
          description: 'Overall quality score must be at least 75%'
        }
      ]
    };
    
    // Update the deliverable with the quality assessment
    setDeliverables(prev => prev.map(d => 
      d.id === request.deliverableId 
        ? { ...d, qualityAssessment: mockResult }
        : d
    ));
    
    addNotification(`Quality check completed for deliverable`);
    return mockResult;
  };

  const handleDeliverableDelete = async (deliverableId: string) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setDeliverables(prev => prev.filter(d => d.id !== deliverableId));
    addNotification(`Deliverable deleted successfully`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Deliverable Check Interface Demo</h1>
          <p className="mt-2 text-lg text-gray-600">
            Upload deliverables, perform quality assessments, and view detailed results
          </p>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="mb-6 space-y-2">
            {notifications.map((notification, index) => (
              <div
                key={index}
                className="bg-green-50 border border-green-200 rounded-md p-4"
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-800">{notification}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Demo Component */}
        <DeliverableCheckInterface
          todoId="todo-demo-1"
          deliverables={deliverables}
          onDeliverableSubmit={handleDeliverableSubmit}
          onQualityCheck={handleQualityCheck}
          onDeliverableDelete={handleDeliverableDelete}
          className="mb-8"
        />

        {/* Demo Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Demo Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div>
              <h3 className="font-medium mb-2">File Upload & Preview</h3>
              <ul className="space-y-1 text-blue-700">
                <li>• Drag & drop or click to upload files</li>
                <li>• Preview images, text files, and PDFs</li>
                <li>• Add descriptions and version notes</li>
                <li>• File type and size validation</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Quality Assessment</h3>
              <ul className="space-y-1 text-blue-700">
                <li>• Visual quality score charts</li>
                <li>• Detailed dimension breakdowns</li>
                <li>• Interactive improvement suggestions</li>
                <li>• Quality gate status indicators</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Validation Results</h3>
              <ul className="space-y-1 text-blue-700">
                <li>• Comprehensive validation checks</li>
                <li>• Format, content, and security validation</li>
                <li>• Detailed recommendations</li>
                <li>• Next steps guidance</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Interactive Features</h3>
              <ul className="space-y-1 text-blue-700">
                <li>• Expandable deliverable details</li>
                <li>• Quality standards selection</li>
                <li>• Real-time loading states</li>
                <li>• Delete and re-check options</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};