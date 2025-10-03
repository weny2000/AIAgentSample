import React from 'react';

interface StatusBadgeProps {
  status: 'completed' | 'processing' | 'queued' | 'failed' | 'pending';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  className = '',
  size = 'md'
}) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          color: 'text-green-800 bg-green-100 border-green-200',
          icon: (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ),
        };
      case 'processing':
        return {
          color: 'text-yellow-800 bg-yellow-100 border-yellow-200',
          icon: (
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ),
        };
      case 'queued':
      case 'pending':
        return {
          color: 'text-blue-800 bg-blue-100 border-blue-200',
          icon: (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case 'failed':
        return {
          color: 'text-red-800 bg-red-100 border-red-200',
          icon: (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ),
        };
      default:
        return {
          color: 'text-gray-800 bg-gray-100 border-gray-200',
          icon: null,
        };
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-sm',
    lg: 'px-3 py-1 text-base',
  };

  const config = getStatusConfig(status);

  return (
    <span 
      className={`inline-flex items-center space-x-1 rounded-full border font-medium capitalize ${config.color} ${sizeClasses[size]} ${className}`}
    >
      {config.icon}
      <span>{status}</span>
    </span>
  );
};