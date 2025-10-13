import React from 'react';
import { AnalysisResultDisplay } from '../components/work-task/AnalysisResultDisplay';
import { TaskAnalysisResult } from '../types/work-task';

// Demo data for showcasing the component
const demoAnalysisResult: TaskAnalysisResult = {
  taskId: 'demo-task-001',
  keyPoints: [
    'Implement user authentication system with multi-factor authentication',
    'Design secure password storage mechanism using bcrypt',
    'Create user registration and login flows with proper validation',
    'Implement session management with secure cookies',
    'Add password reset functionality with email verification',
    'Integrate with existing user management database',
    'Implement role-based access control (RBAC)',
    'Add comprehensive audit logging for security events'
  ],
  relatedWorkgroups: [
    {
      teamId: 'security-team',
      teamName: 'Security Team',
      relevanceScore: 0.95,
      reason: 'Authentication and security implementation requires security team expertise for compliance and best practices',
      contactInfo: 'security@company.com',
      expertise: ['Authentication', 'Security', 'Encryption', 'OAuth', 'SAML', 'Compliance'],
      recommendedInvolvement: 'collaboration'
    },
    {
      teamId: 'frontend-team',
      teamName: 'Frontend Development Team',
      relevanceScore: 0.85,
      reason: 'User interface components for login and registration forms need frontend team implementation',
      contactInfo: 'frontend@company.com',
      expertise: ['React', 'UI/UX', 'Forms', 'Validation', 'TypeScript', 'Responsive Design'],
      recommendedInvolvement: 'consultation'
    },
    {
      teamId: 'backend-team',
      teamName: 'Backend Development Team',
      relevanceScore: 0.90,
      reason: 'API endpoints and database integration for authentication services',
      contactInfo: 'backend@company.com',
      expertise: ['Node.js', 'Database Design', 'API Development', 'Microservices'],
      recommendedInvolvement: 'collaboration'
    },
    {
      teamId: 'devops-team',
      teamName: 'DevOps Team',
      relevanceScore: 0.70,
      reason: 'Deployment and infrastructure setup for authentication services',
      contactInfo: 'devops@company.com',
      expertise: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Monitoring'],
      recommendedInvolvement: 'notification'
    }
  ],
  knowledgeReferences: [
    {
      sourceId: 'auth-policy-001',
      sourceType: 'policy',
      title: 'Authentication Security Policy',
      snippet: 'All user authentication must implement multi-factor authentication and secure password storage using bcrypt with minimum 12 rounds. Session tokens must expire within 24 hours and use secure, httpOnly cookies.',
      relevanceScore: 0.92,
      url: 'https://docs.company.com/policies/auth-security',
      lastUpdated: new Date('2024-01-15')
    },
    {
      sourceId: 'auth-best-practices',
      sourceType: 'best_practice',
      title: 'Authentication Implementation Best Practices',
      snippet: 'When implementing authentication systems, consider using established libraries like Passport.js for Node.js applications. Implement proper rate limiting, account lockout mechanisms, and comprehensive logging.',
      relevanceScore: 0.88,
      url: 'https://docs.company.com/best-practices/auth'
    },
    {
      sourceId: 'oauth-integration-guide',
      sourceType: 'documentation',
      title: 'OAuth 2.0 Integration Guide',
      snippet: 'Step-by-step guide for integrating OAuth 2.0 authentication with third-party providers like Google, Microsoft, and GitHub. Includes code examples and security considerations.',
      relevanceScore: 0.82,
      url: 'https://docs.company.com/guides/oauth-integration',
      lastUpdated: new Date('2024-02-01')
    },
    {
      sourceId: 'user-mgmt-project',
      sourceType: 'previous_project',
      title: 'Customer Portal Authentication System',
      snippet: 'Previous implementation of authentication system for customer portal. Includes lessons learned, performance metrics, and security audit results.',
      relevanceScore: 0.79,
      lastUpdated: new Date('2023-11-20')
    }
  ],
  todoList: [], // This will be handled by TodoListManager component
  riskAssessment: {
    overallRisk: 'medium',
    riskFactors: [
      {
        type: 'security',
        description: 'Authentication systems are high-value targets for attackers and require robust security measures',
        probability: 0.7,
        impact: 0.9,
        mitigation: 'Implement comprehensive security testing, code review, and penetration testing'
      },
      {
        type: 'technical',
        description: 'Complex integration with existing user management systems may cause compatibility issues',
        probability: 0.6,
        impact: 0.7,
        mitigation: 'Create detailed integration plan and conduct thorough testing in staging environment'
      },
      {
        type: 'compliance',
        description: 'Must comply with GDPR, SOC 2, and industry-specific regulations',
        probability: 0.4,
        impact: 0.8,
        mitigation: 'Engage compliance team early and conduct regular compliance audits'
      },
      {
        type: 'timeline',
        description: 'Authentication system is critical path for other features and may cause delays',
        probability: 0.5,
        impact: 0.6,
        mitigation: 'Implement in phases with MVP first, then add advanced features'
      }
    ],
    mitigationStrategies: [
      'Implement comprehensive security testing and code review processes',
      'Conduct thorough integration testing with existing systems',
      'Use established authentication libraries and frameworks',
      'Implement proper session management and token handling',
      'Add comprehensive logging and monitoring for security events',
      'Engage security and compliance teams early in the process',
      'Create detailed documentation and runbooks for operations team'
    ],
    impactAnalysis: {
      affectedSystems: ['User Management', 'Frontend Application', 'API Gateway', 'Database'],
      affectedTeams: ['Security Team', 'Frontend Team', 'Backend Team', 'DevOps Team'],
      businessImpact: 'significant',
      technicalComplexity: 'high',
      resourceRequirements: []
    }
  },
  recommendations: [
    'Use established authentication libraries like Passport.js or Auth0 to reduce implementation risk',
    'Implement proper session management with secure, httpOnly cookies and CSRF protection',
    'Add comprehensive logging for all authentication events and security-related activities',
    'Consider implementing OAuth2 for third-party integrations and single sign-on capabilities',
    'Implement progressive enhancement starting with basic authentication, then adding MFA',
    'Create comprehensive test suites including security testing and penetration testing',
    'Establish monitoring and alerting for authentication failures and suspicious activities'
  ],
  estimatedEffort: {
    totalHours: 320,
    breakdown: [
      { category: 'Planning & Design', hours: 40, description: 'Architecture design and planning' },
      { category: 'Backend Development', hours: 120, description: 'API endpoints and database integration' },
      { category: 'Frontend Development', hours: 80, description: 'UI components and user flows' },
      { category: 'Security Implementation', hours: 60, description: 'Security features and compliance' },
      { category: 'Testing & QA', hours: 20, description: 'Testing and quality assurance' }
    ],
    confidence: 0.75,
    assumptions: [
      'Existing user database schema can be extended',
      'Security team available for consultation',
      'No major changes to existing authentication flows'
    ]
  },
  dependencies: [
    {
      dependencyId: 'dep-001',
      type: 'requires',
      description: 'User database schema must be finalized and migrated before authentication implementation',
      targetTask: 'database-design-task',
      criticality: 'high'
    },
    {
      dependencyId: 'dep-002',
      type: 'blocks',
      description: 'Authentication system must be completed before user profile features can be implemented',
      targetTask: 'user-profile-task',
      criticality: 'critical'
    },
    {
      dependencyId: 'dep-003',
      type: 'influences',
      description: 'Security audit results may require changes to authentication implementation',
      externalSystem: 'Security Audit Process',
      criticality: 'medium'
    }
  ],
  complianceChecks: [
    {
      policyId: 'sec-001',
      policyName: 'Password Security Policy',
      status: 'compliant',
      details: 'Implementation meets minimum password complexity requirements',
      requiredActions: []
    },
    {
      policyId: 'sec-002',
      policyName: 'Multi-Factor Authentication Policy',
      status: 'needs_review',
      details: 'MFA implementation needs security team review',
      requiredActions: ['Schedule security team review', 'Update MFA configuration']
    }
  ]
};

export const AnalysisResultDemo: React.FC = () => {
  const handleContactWorkgroup = (workgroup: any) => {
    alert(`Contacting ${workgroup.teamName} at ${workgroup.contactInfo}`);
  };

  const handleViewKnowledgeReference = (reference: any) => {
    console.log('Viewing knowledge reference:', reference);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Analysis Result Display Demo</h1>
          <p className="mt-2 text-lg text-gray-600">
            Interactive demonstration of the AnalysisResultDisplay component showing AI-powered task analysis results.
          </p>
        </div>

        <AnalysisResultDisplay
          analysisResult={demoAnalysisResult}
          onContactWorkgroup={handleContactWorkgroup}
          onViewKnowledgeReference={handleViewKnowledgeReference}
          className="mb-8"
        />

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Component Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Interactive Elements</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Expandable/collapsible sections</li>
                <li>• Contact workgroup buttons</li>
                <li>• Knowledge reference preview modal</li>
                <li>• External link navigation</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Display Features</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Visual key points with numbering</li>
                <li>• Card-style workgroup display</li>
                <li>• Risk assessment with color coding</li>
                <li>• Relevance score formatting</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};