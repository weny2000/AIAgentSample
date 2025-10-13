import React from 'react';

interface AgentStatusIndicatorProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  isConnected?: boolean;
  className?: string;
}

export const AgentStatusIndicator: React.FC<AgentStatusIndicatorProps> = ({
  status,
  className = ''
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-400',
          text: 'Connected',
          textColor: 'text-green-700',
          bgColor: 'bg-green-100',
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )
        };
      case 'connecting':
        return {
          color: 'bg-yellow-400',
          text: 'Connecting...',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-100',
          icon: (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )
        };
      case 'error':
        return {
          color: 'bg-red-400',
          text: 'Error',
          textColor: 'text-red-700',
          bgColor: 'bg-red-100',
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'disconnected':
      default:
        return {
          color: 'bg-gray-400',
          text: 'Disconnected',
          textColor: 'text-gray-700',
          bgColor: 'bg-gray-100',
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
            </svg>
          )
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Status dot */}
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${config.color}`} />
        {status === 'connected' && (
          <div className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} animate-ping opacity-75`} />
        )}
      </div>
      
      {/* Status text and icon */}
      <div className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.textColor}`}>
        {config.icon}
        <span>{config.text}</span>
      </div>
    </div>
  );
};