import React from 'react';
import { AgentCapability } from '../../types/agent';

interface QuickActionsProps {
  capabilities: AgentCapability[];
  onAction: (action: string) => void;
  className?: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  requiredCapability?: string;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    id: 'show_policies',
    label: 'Show Policies',
    description: 'View current team policies and guidelines',
    requiredCapability: 'policy_analysis',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    id: 'security_check',
    label: 'Security Check',
    description: 'Get help with security compliance',
    requiredCapability: 'artifact_validation',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  },
  {
    id: 'artifact_review',
    label: 'Review Artifact',
    description: 'Submit an artifact for compliance review',
    requiredCapability: 'artifact_validation',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    id: 'search_knowledge',
    label: 'Search Knowledge',
    description: 'Search the organizational knowledge base',
    requiredCapability: 'knowledge_search',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  },
  {
    id: 'show_history',
    label: 'Show History',
    description: 'View conversation history',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Get help using the agent',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
];

export const QuickActions: React.FC<QuickActionsProps> = ({
  capabilities,
  onAction,
  className = ''
}) => {
  // Filter actions based on available capabilities
  const availableActions = DEFAULT_ACTIONS.filter(action => {
    if (!action.requiredCapability) return true;
    return capabilities.some(cap => 
      cap.id === action.requiredCapability && cap.enabled
    );
  });

  if (availableActions.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 bg-gray-50 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700">Quick Actions</h4>
        <span className="text-xs text-gray-500">
          {availableActions.length} available
        </span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {availableActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className="flex flex-col items-center p-3 text-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors group"
            title={action.description}
          >
            <div className="flex items-center justify-center w-8 h-8 mb-2 text-gray-600 group-hover:text-blue-600 transition-colors">
              {action.icon}
            </div>
            <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};