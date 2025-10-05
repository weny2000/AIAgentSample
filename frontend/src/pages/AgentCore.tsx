import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { AgentChat } from '../components/agent/AgentChat';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { api } from '../lib/api';
import { AgentCapability, AgentHealth, Persona } from '../types';

export const AgentCore: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedPersona, setSelectedPersona] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  // Fetch available personas
  const {
    data: personas,
    isLoading: personasLoading
  } = useQuery({
    queryKey: ['personas'],
    queryFn: () => api.getPersonas() as Promise<Persona[]>,
    enabled: !!user
  });

  // Fetch agent capabilities
  const {
    data: capabilities,
    isLoading: capabilitiesLoading
  } = useQuery({
    queryKey: ['agent-capabilities'],
    queryFn: () => api.getAgentCapabilities() as Promise<{ capabilities: AgentCapability[] }>,
    enabled: !!user
  });

  // Fetch agent health
  const {
    data: agentHealth,
    isLoading: healthLoading
  } = useQuery({
    queryKey: ['agent-health'],
    queryFn: () => api.getAgentHealth(true) as Promise<AgentHealth>,
    enabled: !!user,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const isLoading = personasLoading || capabilitiesLoading || healthLoading;

  // Get default persona for user's team
  const defaultPersona = personas?.find(p => 
    p.team_id === user?.team_id && p.name.toLowerCase().includes('leader')
  ) || personas?.[0];

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-gray-600">Loading AgentCore...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                AgentCore
              </h1>
              <p className="mt-1 text-gray-600">
                Intelligent AI assistant for team collaboration and guidance
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Agent Health Status */}
              {agentHealth && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Agent Status:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthStatusColor(agentHealth.status)}`}>
                    {agentHealth.status}
                  </span>
                </div>
              )}
              
              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Persona Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Persona
                  </label>
                  <select
                    value={selectedPersona}
                    onChange={(e) => setSelectedPersona(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Default (Team Leader)</option>
                    {personas?.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name}
                      </option>
                    ))}
                  </select>
                  {selectedPersona && (
                    <p className="mt-1 text-sm text-gray-500">
                      {personas?.find(p => p.id === selectedPersona)?.description}
                    </p>
                  )}
                </div>

                {/* Capabilities Overview */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Capabilities
                  </label>
                  <div className="space-y-2">
                    {capabilities?.capabilities?.slice(0, 4).map((capability) => (
                      <div key={capability.id} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{capability.name}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          capability.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {capability.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ))}
                    {capabilities?.capabilities && capabilities.capabilities.length > 4 && (
                      <p className="text-xs text-gray-500">
                        +{capabilities.capabilities.length - 4} more capabilities
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Agent Health Details */}
              {agentHealth && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Agent Performance</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round(agentHealth.metrics.averageResponseTime)}ms
                      </div>
                      <div className="text-xs text-gray-500">Avg Response Time</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(agentHealth.metrics.successRate * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {agentHealth.metrics.activeSessions}
                      </div>
                      <div className="text-xs text-gray-500">Active Sessions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {Math.round(agentHealth.metrics.memoryUsage * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">Memory Usage</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent Chat Interface */}
      <div className="bg-white shadow rounded-lg" style={{ height: '600px' }}>
        <AgentChat
          personaId={selectedPersona || defaultPersona?.id}
          initialMessage="Hello! I'm ready to help you with any questions or tasks you have."
          className="h-full"
        />
      </div>

      {/* Quick Start Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">
          Getting Started with AgentCore
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">1</span>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-900">Ask Questions</h4>
              <p className="text-sm text-blue-700">
                Ask about policies, procedures, or get guidance on technical decisions.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">2</span>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-900">Use Quick Actions</h4>
              <p className="text-sm text-blue-700">
                Click on quick action buttons for common tasks like policy reviews.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">3</span>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-900">Review History</h4>
              <p className="text-sm text-blue-700">
                Access conversation history to reference previous discussions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};