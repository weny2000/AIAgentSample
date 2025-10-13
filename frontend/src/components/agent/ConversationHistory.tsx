import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../LoadingSpinner';

interface ConversationHistoryProps {
  sessionId: string;
  onClose: () => void;
  onMessageSelect?: (message: string) => void;
  className?: string;
}

interface HistoryMessage {
  messageId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  metadata?: {
    confidence?: number;
    processingTime?: number;
    sources?: string[];
    personaUsed?: string;
  };
}

interface HistoryResponse {
  messages: HistoryMessage[];
  totalCount: number;
  hasMore: boolean;
  summary?: string;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  sessionId,
  onClose,
  onMessageSelect,
  className = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'user' | 'agent'>('all');
  const [limit] = useState(50);

  // Fetch conversation history
  const {
    data: history,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['conversation-history', sessionId, limit],
    queryFn: async () => {
      const response = await api.getAgentSessionHistory(sessionId, { limit, includeReferences: true });
      return response as HistoryResponse;
    },
    enabled: !!sessionId
  });

  // Filter messages based on search and filter
  const filteredMessages = React.useMemo(() => {
    if (!history?.messages) return [];

    let filtered = history.messages;

    // Apply role filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(msg => msg.role === selectedFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(msg =>
        msg.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [history?.messages, selectedFilter, searchQuery]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleMessageClick = (message: HistoryMessage) => {
    if (onMessageSelect && message.role === 'user') {
      onMessageSelect(message.content);
    }
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${className}`}>
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Conversation History
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {history?.totalCount ? `${history.totalCount} messages` : 'Loading...'}
                  {history?.summary && ` • ${history.summary}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="bg-white rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search and filters */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
              {/* Search input */}
              <div className="flex-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              {/* Filter dropdown */}
              <div>
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value as 'all' | 'user' | 'agent')}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  <option value="all">All messages</option>
                  <option value="user">My messages</option>
                  <option value="agent">Agent responses</option>
                </select>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
                <span className="ml-2 text-gray-600">Loading conversation history...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600 mb-2">
                  <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">Failed to load conversation history</p>
                <button
                  onClick={() => refetch()}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  Try again
                </button>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">
                  <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-gray-600">
                  {searchQuery ? 'No messages match your search' : 'No messages found'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMessages.map((message) => (
                  <div
                    key={message.messageId}
                    className={`p-3 rounded-lg border ${
                      message.role === 'user'
                        ? 'bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100'
                        : 'bg-white border-gray-200'
                    } ${onMessageSelect && message.role === 'user' ? 'transition-colors' : ''}`}
                    onClick={() => handleMessageClick(message)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            message.role === 'user'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {message.role === 'user' ? 'You' : 'Agent'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(message.timestamp)}
                          </span>
                          {message.metadata?.confidence && (
                            <span className="text-xs text-gray-500">
                              {Math.round(message.metadata.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">
                          {message.content}
                        </p>
                        {message.metadata?.sources && message.metadata.sources.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            Sources: {message.metadata.sources.join(', ')}
                          </div>
                        )}
                      </div>
                      {onMessageSelect && message.role === 'user' && (
                        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
            {history?.hasMore && (
              <button
                type="button"
                onClick={() => {/* TODO: Load more messages */}}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Load More
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};