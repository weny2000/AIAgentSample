import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { AgentMessage } from './AgentMessage';
import { AgentTypingIndicator } from './AgentTypingIndicator';
import { AgentStatusIndicator } from './AgentStatusIndicator';
import { ConversationHistory } from './ConversationHistory';
import { QuickActions } from './QuickActions';
import { MessageInput } from './MessageInput';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../LoadingSpinner';
import {
  AgentSession,
  ChatMessage,
  WebSocketResponse
} from '../../types/agent';
import { env } from '../../lib/env';

interface AgentChatProps {
  personaId?: string;
  initialMessage?: string;
  className?: string;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  personaId,
  initialMessage,
  className = ''
}) => {
  const { user } = useAuthStore();
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<{ focus: () => void; clear: () => void }>(null);

  // WebSocket connection for real-time messaging
  const {
    isConnected,
    sendMessage: sendWebSocketMessage,
    connectionStatus
  } = useWebSocket({
    url: `${env.VITE_WS_URL}/agent/ws`,
    queryParams: {
      userId: user?.id || '',
      teamId: user?.team_id || '',
      role: user?.role || 'user',
      permissions: 'read,write,search'
    },
    onMessage: handleWebSocketMessage,
    onError: (error) => console.error('WebSocket error:', error),
    enabled: !!user
  });

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: {
      personaId?: string;
      initialMessage?: string;
      context?: Record<string, any>;
    }) => {
      const response = await api.startAgentSession({
        userId: user?.id || '',
        teamId: user?.team_id || '',
        personaId: data.personaId,
        initialMessage: data.initialMessage,
        context: data.context
      });
      return response as AgentSession;
    },
    onSuccess: (sessionData) => {
      setSession(sessionData);
      
      // Join WebSocket session
      if (isConnected) {
        sendWebSocketMessage({
          action: 'join_session',
          sessionId: sessionData.sessionId
        });
      }

      // Add welcome message if provided
      if (sessionData.welcomeMessage) {
        const welcomeMsg: ChatMessage = {
          id: `welcome-${Date.now()}`,
          type: 'agent',
          content: sessionData.welcomeMessage,
          timestamp: new Date(),
          confidence: 1.0,
          persona: sessionData.agentConfiguration.name
        };
        setMessages([welcomeMsg]);
      }
    },
    onError: (error) => {
      console.error('Failed to start session:', error);
    }
  });

  // Handle WebSocket messages
  function handleWebSocketMessage(message: WebSocketResponse) {
    switch (message.type) {
      case 'message':
        if (message.sessionId === session?.sessionId) {
          const agentMsg: ChatMessage = {
            id: message.messageId || `msg-${Date.now()}`,
            type: 'agent',
            content: message.content || '',
            timestamp: new Date(message.timestamp),
            confidence: message.confidence,
            references: message.references,
            actionItems: message.actionItems,
            suggestions: message.suggestions,
            processingTime: message.processingTime,
            persona: session?.agentConfiguration.name
          };
          setMessages(prev => [...prev, agentMsg]);
          setIsTyping(false);
        }
        break;

      case 'typing':
        if (message.sessionId === session?.sessionId) {
          setIsTyping(!!message.content);
        }
        break;

      case 'error':
        console.error('WebSocket error:', message.error);
        setIsTyping(false);
        break;

      case 'status':
        console.log('WebSocket status:', message.content);
        break;
    }
  }

  // Send message
  const handleSendMessage = useCallback(async (message: string) => {
    if (!session || !message.trim()) return;

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: message.trim(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setCurrentMessage('');

    // Send via WebSocket if connected, otherwise fall back to REST API
    if (isConnected) {
      setIsTyping(true);
      sendWebSocketMessage({
        action: 'message',
        sessionId: session.sessionId,
        message: message.trim(),
        messageType: 'text'
      });
    } else {
      // Fallback to REST API
      try {
        const response = await api.sendAgentMessage(session.sessionId, {
          message: message.trim(),
          messageType: 'text'
        });

        const agentMsg: ChatMessage = {
          id: response.messageId,
          type: 'agent',
          content: response.response,
          timestamp: new Date(),
          confidence: response.confidence,
          references: response.references,
          actionItems: response.actionItems,
          suggestions: response.suggestions,
          processingTime: response.processingTime,
          persona: session?.agentConfiguration.name
        };
        setMessages(prev => [...prev, agentMsg]);
      } catch (error) {
        console.error('Failed to send message:', error);
        // Add error message
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          type: 'agent',
          content: 'I apologize, but I encountered an error processing your message. Please try again.',
          timestamp: new Date(),
          confidence: 0
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
  }, [session, isConnected, sendWebSocketMessage]);

  // Handle quick action
  const handleQuickAction = useCallback((action: string) => {
    switch (action) {
      case 'show_policies':
        handleSendMessage('What are the current policies for our team?');
        break;
      case 'security_check':
        handleSendMessage('Can you help me with a security compliance check?');
        break;
      case 'artifact_review':
        handleSendMessage('I need help reviewing an artifact for compliance.');
        break;
      case 'show_history':
        setShowHistory(true);
        break;
      default:
        console.warn('Unknown quick action:', action);
    }
  }, [handleSendMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Start session on mount
  useEffect(() => {
    if (user && !session && !startSessionMutation.isPending) {
      startSessionMutation.mutate({
        personaId,
        initialMessage,
        context: {
          currentTopic: 'general',
          userRole: user.role,
          department: user.department
        }
      });
    }
  }, [user, session, personaId, initialMessage, startSessionMutation]);

  // Loading state
  if (startSessionMutation.isPending) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-gray-600">Starting agent session...</span>
      </div>
    );
  }

  // Error state
  if (startSessionMutation.isError) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center">
          <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-medium text-red-800">Failed to start agent session</h3>
        </div>
        <p className="mt-2 text-sm text-red-700">
          {(startSessionMutation.error as Error)?.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => startSessionMutation.mutate({ personaId, initialMessage })}
          className="mt-3 text-sm text-red-600 hover:text-red-500 font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              {session.agentConfiguration.name}
            </h3>
            <p className="text-sm text-gray-500">
              {session.agentConfiguration.description}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <AgentStatusIndicator 
            status={connectionStatus}
            isConnected={isConnected}
          />
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            title="Show conversation history"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions
        capabilities={session.capabilities}
        onAction={handleQuickAction}
        className="border-b border-gray-200"
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <AgentMessage
            key={message.id}
            message={message}
            user={user || undefined}
            onActionClick={(action) => handleQuickAction(action)}
          />
        ))}
        
        {isTyping && (
          <AgentTypingIndicator 
            agentName={session.agentConfiguration.name}
          />
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <MessageInput
        value={currentMessage}
        onChange={setCurrentMessage}
        onSend={handleSendMessage}
        disabled={!isConnected && connectionStatus !== 'connected'}
        placeholder="Ask your agent a question..."
        ref={inputRef}
      />

      {/* Conversation History Modal */}
      {showHistory && session && (
        <ConversationHistory
          sessionId={session.sessionId}
          onClose={() => setShowHistory(false)}
          onMessageSelect={(message) => {
            setCurrentMessage(message);
            setShowHistory(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};