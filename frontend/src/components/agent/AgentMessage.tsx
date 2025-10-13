import React from 'react';
import { ChatMessage, User } from '../../types';

interface AgentMessageProps {
  message: ChatMessage;
  user?: User;
  onActionClick?: (action: string) => void;
}

export const AgentMessage: React.FC<AgentMessageProps> = ({
  message,
  user,
  onActionClick
}) => {
  const isUser = message.type === 'user';
  
  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return '';
    if (confidence >= 0.8) return 'text-green-600 bg-green-100';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatProcessingTime = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Message bubble */}
        <div
          className={`px-4 py-3 rounded-lg ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        {/* Message metadata */}
        <div className={`mt-1 text-xs text-gray-500 ${isUser ? 'text-right' : 'text-left'}`}>
          <div className="flex items-center space-x-2">
            {!isUser && message.persona && (
              <span className="font-medium">{message.persona}</span>
            )}
            {message.confidence !== undefined && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(message.confidence)}`}>
                {Math.round(message.confidence * 100)}% confidence
              </span>
            )}
            {message.processingTime && (
              <span className="text-gray-400">
                {formatProcessingTime(message.processingTime)}
              </span>
            )}
            <span>{formatTimestamp(message.timestamp)}</span>
          </div>
        </div>

        {/* References/Sources */}
        {message.references && message.references.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 rounded border">
            <p className="text-xs font-medium text-gray-700 mb-2">Sources:</p>
            <div className="space-y-2">
              {message.references.map((source, index) => (
                <div key={index} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-600 capitalize">
                      {source.sourceType}
                    </span>
                    <span className="text-gray-500">
                      {Math.round(source.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-gray-600 mt-1 italic">"{source.snippet}"</p>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      View source →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Items */}
        {message.actionItems && message.actionItems.length > 0 && (
          <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-xs font-medium text-blue-700 mb-2">Action Items:</p>
            <div className="space-y-2">
              {message.actionItems.map((item, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                    item.priority === 'high' ? 'bg-red-400' :
                    item.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-xs text-blue-800">{item.description}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.priority === 'high' ? 'bg-red-100 text-red-700' :
                        item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {item.priority}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.status === 'completed' ? 'bg-green-100 text-green-700' :
                        item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {message.suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => onActionClick?.(suggestion)}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-full hover:bg-gray-50 hover:border-gray-400 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Avatar */}
      <div className={`flex-shrink-0 ${isUser ? 'order-1 ml-3' : 'order-2 mr-3'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600' : 'bg-gray-300'
        }`}>
          {isUser ? (
            <span className="text-white text-sm font-medium">
              {user?.name?.charAt(0) || 'U'}
            </span>
          ) : (
            <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};