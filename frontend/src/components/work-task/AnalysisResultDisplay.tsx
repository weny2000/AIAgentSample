import React, { useState, useCallback } from 'react';
import { TaskAnalysisResult, RelatedWorkgroup, KnowledgeReference, RiskFactor } from '../../types/work-task';

interface AnalysisResultDisplayProps {
  analysisResult: TaskAnalysisResult;
  onUpdateTodo?: (todoId: string, updates: any) => Promise<void>;
  onSubmitDeliverable?: (todoId: string, deliverable: File) => Promise<void>;
  onContactWorkgroup?: (workgroup: RelatedWorkgroup) => void;
  onViewKnowledgeReference?: (reference: KnowledgeReference) => void;
  className?: string;
}

interface ExpandedSections {
  keyPoints: boolean;
  workgroups: boolean;
  knowledgeReferences: boolean;
  riskAssessment: boolean;
  recommendations: boolean;
  dependencies: boolean;
}

const RISK_COLORS = {
  low: 'text-green-600 bg-green-50 border-green-200',
  medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  critical: 'text-red-600 bg-red-50 border-red-200',
} as const;

const INVOLVEMENT_COLORS = {
  consultation: 'text-blue-600 bg-blue-50 border-blue-200',
  collaboration: 'text-purple-600 bg-purple-50 border-purple-200',
  approval: 'text-orange-600 bg-orange-50 border-orange-200',
  notification: 'text-gray-600 bg-gray-50 border-gray-200',
} as const;

export const AnalysisResultDisplay: React.FC<AnalysisResultDisplayProps> = ({
  analysisResult,
  onUpdateTodo,
  onSubmitDeliverable,
  onContactWorkgroup,
  onViewKnowledgeReference,
  className = '',
}) => {
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({
    keyPoints: true,
    workgroups: true,
    knowledgeReferences: true,
    riskAssessment: true,
    recommendations: false,
    dependencies: false,
  });

  const [selectedKnowledgeRef, setSelectedKnowledgeRef] = useState<KnowledgeReference | null>(null);

  const toggleSection = useCallback((section: keyof ExpandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleContactWorkgroup = useCallback((workgroup: RelatedWorkgroup) => {
    onContactWorkgroup?.(workgroup);
  }, [onContactWorkgroup]);

  const handleViewKnowledgeReference = useCallback((reference: KnowledgeReference) => {
    setSelectedKnowledgeRef(reference);
    onViewKnowledgeReference?.(reference);
  }, [onViewKnowledgeReference]);

  const formatRelevanceScore = (score: number) => {
    return `${Math.round(score * 100)}%`;
  };

  const getRiskFactorIcon = (type: RiskFactor['type']) => {
    const icons = {
      technical: '⚙️',
      resource: '👥',
      timeline: '⏰',
      compliance: '📋',
      security: '🔒',
      business: '💼',
    };
    return icons[type] || '⚠️';
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Task Analysis Results</h2>
            <p className="text-sm text-gray-600 mt-1">
              AI-powered analysis and recommendations for your work task
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
              Analysis Complete
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Key Points Section */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('keyPoints')}
            className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <span className="mr-2">🎯</span>
                Key Points ({analysisResult.keyPoints.length})
              </h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                  expandedSections.keyPoints ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {expandedSections.keyPoints && (
            <div className="p-4 space-y-3">
              {analysisResult.keyPoints.map((point, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-md border border-blue-200">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-600">{index + 1}</span>
                  </div>
                  <p className="text-sm text-gray-700 flex-1">{point}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related Workgroups Section */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('workgroups')}
            className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <span className="mr-2">👥</span>
                Related Workgroups ({analysisResult.relatedWorkgroups.length})
              </h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                  expandedSections.workgroups ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {expandedSections.workgroups && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysisResult.relatedWorkgroups.map((workgroup, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">{workgroup.teamName}</h4>
                        <p className="text-xs text-gray-500 mt-1">Team ID: {workgroup.teamId}</p>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-xs font-medium text-blue-600">
                          {formatRelevanceScore(workgroup.relevanceScore)} match
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          INVOLVEMENT_COLORS[workgroup.recommendedInvolvement]
                        }`}>
                          {workgroup.recommendedInvolvement}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3">{workgroup.reason}</p>
                    
                    {workgroup.expertise.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-700 mb-1">Expertise:</p>
                        <div className="flex flex-wrap gap-1">
                          {workgroup.expertise.map((skill, skillIndex) => (
                            <span
                              key={skillIndex}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      {workgroup.contactInfo && (
                        <span className="text-xs text-gray-500">{workgroup.contactInfo}</span>
                      )}
                      <button
                        onClick={() => handleContactWorkgroup(workgroup)}
                        className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Contact
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Knowledge References Section */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('knowledgeReferences')}
            className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <span className="mr-2">📚</span>
                Knowledge Base References ({analysisResult.knowledgeReferences.length})
              </h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                  expandedSections.knowledgeReferences ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {expandedSections.knowledgeReferences && (
            <div className="p-4 space-y-3">
              {analysisResult.knowledgeReferences.map((reference, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900">{reference.title}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          reference.sourceType === 'policy' ? 'bg-red-100 text-red-800' :
                          reference.sourceType === 'documentation' ? 'bg-blue-100 text-blue-800' :
                          reference.sourceType === 'best_practice' ? 'bg-green-100 text-green-800' :
                          reference.sourceType === 'previous_project' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {reference.sourceType.replace('_', ' ')}
                        </span>
                        <span className="text-xs font-medium text-blue-600">
                          {formatRelevanceScore(reference.relevanceScore)} relevance
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{reference.snippet}</p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span>Source ID: {reference.sourceId}</span>
                      {reference.lastUpdated && (
                        <span>• Updated: {new Date(reference.lastUpdated).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleViewKnowledgeReference(reference)}
                        className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview
                      </button>
                      {reference.url && (
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        >
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risk Assessment Section */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('riskAssessment')}
            className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <span className="mr-2">⚠️</span>
                Risk Assessment
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                  RISK_COLORS[analysisResult.riskAssessment.overallRisk]
                }`}>
                  {analysisResult.riskAssessment.overallRisk} risk
                </span>
              </h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                  expandedSections.riskAssessment ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {expandedSections.riskAssessment && (
            <div className="p-4 space-y-4">
              {/* Risk Factors */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Risk Factors</h4>
                <div className="space-y-2">
                  {analysisResult.riskAssessment.riskFactors.map((factor, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-md">
                      <span className="text-lg">{getRiskFactorIcon(factor.type)}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 capitalize">{factor.type}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">
                              P: {Math.round(factor.probability * 100)}%
                            </span>
                            <span className="text-xs text-gray-500">
                              I: {Math.round(factor.impact * 100)}%
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{factor.description}</p>
                        {factor.mitigation && (
                          <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            <strong>Mitigation:</strong> {factor.mitigation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mitigation Strategies */}
              {analysisResult.riskAssessment.mitigationStrategies.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Mitigation Strategies</h4>
                  <div className="space-y-2">
                    {analysisResult.riskAssessment.mitigationStrategies.map((strategy, index) => (
                      <div key={index} className="flex items-start space-x-2 p-2 bg-green-50 rounded-md">
                        <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-700">{strategy}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recommendations Section */}
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('recommendations')}
            className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 flex items-center">
                <span className="mr-2">💡</span>
                Recommendations ({analysisResult.recommendations.length})
              </h3>
              <svg
                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                  expandedSections.recommendations ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          
          {expandedSections.recommendations && (
            <div className="p-4 space-y-2">
              {analysisResult.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                  <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dependencies Section */}
        {analysisResult.dependencies.length > 0 && (
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSection('dependencies')}
              className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-t-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 flex items-center">
                  <span className="mr-2">🔗</span>
                  Dependencies ({analysisResult.dependencies.length})
                </h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transform transition-transform ${
                    expandedSections.dependencies ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            {expandedSections.dependencies && (
              <div className="p-4 space-y-3">
                {analysisResult.dependencies.map((dependency, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-purple-50 rounded-md border border-purple-200">
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        RISK_COLORS[dependency.criticality]
                      }`}>
                        {dependency.type}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700 mb-1">{dependency.description}</p>
                      {dependency.targetTask && (
                        <p className="text-xs text-gray-500">Target Task: {dependency.targetTask}</p>
                      )}
                      {dependency.externalSystem && (
                        <p className="text-xs text-gray-500">External System: {dependency.externalSystem}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      RISK_COLORS[dependency.criticality]
                    }`}>
                      {dependency.criticality}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Knowledge Reference Preview Modal */}
      {selectedKnowledgeRef && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">{selectedKnowledgeRef.title}</h3>
              <button
                onClick={() => setSelectedKnowledgeRef(null)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedKnowledgeRef.sourceType === 'policy' ? 'bg-red-100 text-red-800' :
                    selectedKnowledgeRef.sourceType === 'documentation' ? 'bg-blue-100 text-blue-800' :
                    selectedKnowledgeRef.sourceType === 'best_practice' ? 'bg-green-100 text-green-800' :
                    selectedKnowledgeRef.sourceType === 'previous_project' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedKnowledgeRef.sourceType.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatRelevanceScore(selectedKnowledgeRef.relevanceScore)} relevance
                  </span>
                </div>
                <p className="text-sm text-gray-600">Source ID: {selectedKnowledgeRef.sourceId}</p>
                {selectedKnowledgeRef.lastUpdated && (
                  <p className="text-sm text-gray-600">
                    Last Updated: {new Date(selectedKnowledgeRef.lastUpdated).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700">{selectedKnowledgeRef.snippet}</p>
              </div>
              {selectedKnowledgeRef.url && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <a
                    href={selectedKnowledgeRef.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Full Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};