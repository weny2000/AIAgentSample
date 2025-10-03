import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { AgentResponse, QueryRequest } from '../types';

interface ChatMessage {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
  sources?: AgentResponse['sources'];
  confidence?: number;
  persona?: string;
}

const SAMPLE_QUERIES = [
  "What are the security requirements for deploying to production?",
  "How should I structure my API documentation?",
  "What's the process for requesting infrastructure changes?",
  "Can you review this deployment configuration?",
  "What are the coding standards for our team?",
];

export const AgentQuery: React.FC = () => {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [selectedPersona, setSelectedPersona] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mock personas - in real implementation, this would come from API
  const personas = [
    { id: 'team-lead', name: 'Team Lead', description: 'Technical leadership and project guidance' },
    { id: 'security-expert', name: 'Security Expert', description: 'Security policies and compliance' },
    { id: 'architect', name: 'Solution Architect', description: 'System design and architecture decisions' },
    { id: 'devops', name: 'DevOps Engineer', description: 'Infrastructure and deployment guidance' },
  ];

  const queryMutation = useMutation({
    mutationFn: async (data: QueryRequest) => {
      const response = await api.queryAgent(data);
      return response as AgentResponse;
    },
    onSuccess: (data, variables) => {
      // Add user message
      const userMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'user',
        content: variables.query,
        timestamp: new Date(),
      };

      // Add agent response
      const agentMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'agent',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources,
        confidence: data.confidence,
        persona: data.persona,
      };

      setMessages(prev => [...prev, userMessage, agentMessage]);
      setCurrentQuery('');
    },
    onError: (error: Error) => {
      // Add user message and error response
      const userMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'user',
        content: currentQuery,
        timestamp: new Date(),
      };

      const errorMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'agent',
        content: `I apologize, but I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
        confidence: 0,
      };

      setMessages(prev => [...prev, userMessage, errorMessage]);
      setCurrentQuery('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuery.trim()) return;

    queryMutation.mutate({
      query: currentQuery.trim(),
      persona: selectedPersona || undefined,
      context: user?.team_id,
    });
  };

  const handleSampleQuery = (query: string) => {
    setCurrentQuery(query);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Agent Query
          </h1>
          <p className="text-gray-600 mb-6">
            Ask your team leader's AI agent for guidance, policy clarification, or project assistance.
          </p>

          {/* Persona Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Persona (Optional)
            </label>
            <select
              value={selectedPersona}
              onChange={(e) => setSelectedPersona(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Default (Team Leader)</option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
            {selectedPersona && (
              <p className="mt-1 text-sm text-gray-500">
                {personas.find(p => p.id === selectedPersona)?.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="bg-white shadow rounded-lg flex flex-col" style={{ height: '600px' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Start a conversation</h3>
              <p className="mt-1 text-sm text-gray-500">
                Ask your AI agent any question about policies, procedures, or technical guidance.
              </p>
              
              {/* Sample Queries */}
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-3">Try asking:</p>
                <div className="space-y-2">
                  {SAMPLE_QUERIES.map((query, index) => (
                    <button
                      key={index}
                      onClick={() => handleSampleQuery(query)}
                      className="block w-full text-left px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                    >
                      "{query}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-3xl ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* Message metadata */}
                  <div className={`mt-1 text-xs text-gray-500 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
                    {message.type === 'agent' && message.persona && (
                      <span className="mr-2">
                        {personas.find(p => p.id === message.persona)?.name || 'Team Leader'}
                      </span>
                    )}
                    {message.confidence !== undefined && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-2 ${getConfidenceColor(message.confidence)}`}>
                        {Math.round(message.confidence * 100)}% confidence
                      </span>
                    )}
                    {formatTimestamp(message.timestamp)}
                  </div>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded border">
                      <p className="text-xs font-medium text-gray-700 mb-2">Sources:</p>
                      <div className="space-y-2">
                        {message.sources.map((source, index) => (
                          <div key={index} className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-600">{source.type}</span>
                              <span className="text-gray-500">{Math.round(source.confidence * 100)}%</span>
                            </div>
                            <p className="text-gray-600 mt-1 italic">"{source.snippet}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Avatar */}
                <div className={`flex-shrink-0 ${message.type === 'user' ? 'order-1 ml-3' : 'order-2 mr-3'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    message.type === 'user' ? 'bg-blue-600' : 'bg-gray-300'
                  }`}>
                    {message.type === 'user' ? (
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
            ))
          )}
          
          {/* Loading indicator */}
          {queryMutation.isPending && (
            <div className="flex justify-start">
              <div className="flex-shrink-0 mr-3">
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                  <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="max-w-3xl">
                <div className="px-4 py-2 bg-gray-100 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-gray-500">Agent is thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex space-x-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your agent a question..."
                rows={2}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                disabled={queryMutation.isPending}
              />
            </div>
            <button
              type="submit"
              disabled={!currentQuery.trim() || queryMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {queryMutation.isPending ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};