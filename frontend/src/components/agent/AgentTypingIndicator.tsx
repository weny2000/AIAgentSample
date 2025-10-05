import React from 'react';

interface AgentTypingIndicatorProps {
  agentName?: string;
  className?: string;
}

export const AgentTypingIndicator: React.FC<AgentTypingIndicatorProps> = ({
  agentName = 'Agent',
  className = ''
}) => {
  return (
    <div className={`flex justify-start ${className}`}>
      <div className="flex-shrink-0 mr-3">
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      <div className="max-w-3xl">
        <div className="px-4 py-3 bg-gray-100 rounded-lg">
          <div className="flex items-center space-x-2">
            {/* Animated typing dots */}
            <div className="flex space-x-1">
              <div 
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div 
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div 
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span className="text-sm text-gray-500">
              {agentName} is thinking...
            </span>
          </div>
        </div>
        <div className="mt-1 text-xs text-gray-500 text-left">
          <span className="font-medium">{agentName}</span>
        </div>
      </div>
    </div>
  );
};