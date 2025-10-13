import React, { useState, useCallback, useRef } from 'react';
import {
  DeliverableInfo,
  ValidationResult,
  QualityAssessmentResult,
  ImprovementSuggestion,
  QualityDimension,
  QualityGate,
  DeliverableSubmissionRequest,
  QualityCheckRequest
} from '../../types/work-task';

interface DeliverableCheckInterfaceProps {
  todoId: string;
  deliverables?: DeliverableInfo[];
  onDeliverableSubmit: (request: DeliverableSubmissionRequest) => Promise<void>;
  onQualityCheck: (request: QualityCheckRequest) => Promise<QualityAssessmentResult>;
  onDeliverableDelete?: (deliverableId: string) => Promise<void>;
  className?: string;
}

interface FilePreview {
  file: File;
  preview: string;
  type: 'image' | 'text' | 'pdf' | 'other';
}

const QUALITY_SCORE_COLORS = {
  excellent: 'text-green-600 bg-green-100',
  good: 'text-blue-600 bg-blue-100', 
  fair: 'text-yellow-600 bg-yellow-100',
  poor: 'text-red-600 bg-red-100'
} as const;

const IMPROVEMENT_CATEGORY_COLORS = {
  critical: 'border-red-500 bg-red-50',
  major: 'border-orange-500 bg-orange-50',
  minor: 'border-yellow-500 bg-yellow-50',
  enhancement: 'border-blue-500 bg-blue-50'
} as const;

const VALIDATION_STATUS_COLORS = {
  passed: 'text-green-600 bg-green-100',
  failed: 'text-red-600 bg-red-100',
  warning: 'text-yellow-600 bg-yellow-100',
  skipped: 'text-gray-600 bg-gray-100'
} as const;

export const DeliverableCheckInterface: React.FC<DeliverableCheckInterfaceProps> = ({
  todoId,
  deliverables = [],
  onDeliverableSubmit,
  onQualityCheck,
  onDeliverableDelete,
  className = ''
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [description, setDescription] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [qualityCheckLoading, setQualityCheckLoading] = useState<Record<string, boolean>>({});
  const [expandedDeliverables, setExpandedDeliverables] = useState<Set<string>>(new Set());
  const [selectedQualityStandards, setSelectedQualityStandards] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection and preview generation
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    
    let preview = '';
    let type: FilePreview['type'] = 'other';
    
    if (file.type.startsWith('image/')) {
      type = 'image';
      preview = URL.createObjectURL(file);
    } else if (file.type === 'text/plain' || file.type.includes('text')) {
      type = 'text';
      try {
        preview = await file.text();
      } catch (error) {
        console.error('Failed to read text file:', error);
        preview = 'Unable to preview text content';
      }
    } else if (file.type === 'application/pdf') {
      type = 'pdf';
      preview = URL.createObjectURL(file);
    }
    
    setFilePreview({ file, preview, type });
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle deliverable submission
  const handleSubmit = useCallback(async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    try {
      await onDeliverableSubmit({
        todoId,
        file: selectedFile,
        description: description.trim() || undefined,
        versionNotes: versionNotes.trim() || undefined
      });
      
      // Reset form
      setSelectedFile(null);
      setFilePreview(null);
      setDescription('');
      setVersionNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to submit deliverable:', error);
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, todoId, description, versionNotes, onDeliverableSubmit]);

  // Handle quality check
  const handleQualityCheck = useCallback(async (deliverableId: string) => {
    setQualityCheckLoading(prev => ({ ...prev, [deliverableId]: true }));
    
    try {
      await onQualityCheck({
        deliverableId,
        qualityStandards: selectedQualityStandards.length > 0 ? selectedQualityStandards : undefined,
        priority: 'medium'
      });
    } catch (error) {
      console.error('Failed to perform quality check:', error);
    } finally {
      setQualityCheckLoading(prev => ({ ...prev, [deliverableId]: false }));
    }
  }, [selectedQualityStandards, onQualityCheck]);

  // Toggle deliverable expansion
  const toggleDeliverableExpansion = useCallback((deliverableId: string) => {
    setExpandedDeliverables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deliverableId)) {
        newSet.delete(deliverableId);
      } else {
        newSet.add(deliverableId);
      }
      return newSet;
    });
  }, []);

  // Get quality score color class
  const getQualityScoreColor = useCallback((score: number): keyof typeof QUALITY_SCORE_COLORS => {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }, []);

  // Render quality score chart
  const renderQualityChart = useCallback((assessment: QualityAssessmentResult) => {
    const dimensions = assessment.qualityDimensions;
    const maxScore = 100;
    
    return (
      <div className="space-y-4">
        {/* Overall Score Circle */}
        <div className="flex items-center justify-center">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-200"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={`${getQualityScoreColor(assessment.overallScore).includes('green') ? 'text-green-500' :
                  getQualityScoreColor(assessment.overallScore).includes('blue') ? 'text-blue-500' :
                  getQualityScoreColor(assessment.overallScore).includes('yellow') ? 'text-yellow-500' :
                  'text-red-500'}`}
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${assessment.overallScore}, 100`}
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">{assessment.overallScore}</div>
                <div className="text-xs text-gray-500">Score</div>
              </div>
            </div>
          </div>
        </div>

        {/* Dimension Bars */}
        <div className="space-y-3">
          {dimensions.map((dimension) => (
            <div key={dimension.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {dimension.name.replace('_', ' ')}
                </span>
                <span className="text-sm text-gray-500">{dimension.score}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    dimension.score >= 90 ? 'bg-green-500' :
                    dimension.score >= 75 ? 'bg-blue-500' :
                    dimension.score >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${dimension.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [getQualityScoreColor]);

  // Render improvement suggestions
  const renderImprovementSuggestions = useCallback((suggestions: ImprovementSuggestion[]) => {
    const sortedSuggestions = [...suggestions].sort((a, b) => b.priority - a.priority);
    
    return (
      <div className="space-y-3">
        {sortedSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`p-4 rounded-lg border-l-4 ${IMPROVEMENT_CATEGORY_COLORS[suggestion.category]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <h4 className="text-sm font-medium text-gray-900">{suggestion.title}</h4>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    suggestion.category === 'critical' ? 'bg-red-100 text-red-800' :
                    suggestion.category === 'major' ? 'bg-orange-100 text-orange-800' :
                    suggestion.category === 'minor' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {suggestion.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{suggestion.description}</p>
                
                {suggestion.example && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <span className="font-medium text-gray-700">Example: </span>
                    <span className="text-gray-600">{suggestion.example}</span>
                  </div>
                )}
              </div>
              
              <div className="ml-4 flex flex-col items-end space-y-1">
                <div className="flex items-center space-x-2 text-xs">
                  <span className={`px-2 py-0.5 rounded ${
                    suggestion.impact === 'high' ? 'bg-red-100 text-red-700' :
                    suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {suggestion.impact} impact
                  </span>
                  <span className={`px-2 py-0.5 rounded ${
                    suggestion.effort === 'high' ? 'bg-red-100 text-red-700' :
                    suggestion.effort === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {suggestion.effort} effort
                  </span>
                </div>
                <div className="text-xs text-gray-500">Priority: {suggestion.priority}/10</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }, []);

  // Render validation results
  const renderValidationResults = useCallback((validation: ValidationResult) => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900">Validation Results</h4>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            VALIDATION_STATUS_COLORS[validation.overallStatus]
          }`}>
            {validation.overallStatus}
          </span>
        </div>
        
        <div className="space-y-2">
          {validation.validationChecks.map((check) => (
            <div key={check.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900">{check.name}</span>
                  <span className="text-xs text-gray-500 capitalize">({check.type})</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{check.details}</p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                VALIDATION_STATUS_COLORS[check.status]
              }`}>
                {check.status}
              </span>
            </div>
          ))}
        </div>
        
        {validation.recommendations.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-medium text-gray-700 mb-2">Recommendations</h5>
            <ul className="space-y-1">
              {validation.recommendations.map((rec, index) => (
                <li key={index} className="text-xs text-gray-600 flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }, []);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Deliverable Check Interface</h2>
        <p className="text-sm text-gray-600 mt-1">
          Upload deliverables and perform quality assessments
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* File Upload Section */}
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-900">Upload New Deliverable</h3>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-4">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="mt-2 block text-sm font-medium text-gray-900">
                    Click to upload or drag and drop
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    PDF, DOC, TXT, Images up to 10MB
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  onChange={handleFileInputChange}
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif"
                />
              </div>
            </div>
          </div>

          {/* File Preview */}
          {filePreview && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-4">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">File Preview</h4>
                  <div className="text-xs text-gray-500 mb-3">
                    {filePreview.file.name} ({(filePreview.file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                  
                  {filePreview.type === 'image' && (
                    <img 
                      src={filePreview.preview} 
                      alt="Preview" 
                      className="max-w-full h-48 object-contain border border-gray-200 rounded"
                    />
                  )}
                  
                  {filePreview.type === 'text' && (
                    <div className="bg-gray-50 p-3 rounded text-xs font-mono max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">{filePreview.preview.substring(0, 500)}...</pre>
                    </div>
                  )}
                  
                  {filePreview.type === 'pdf' && (
                    <div className="bg-gray-50 p-4 rounded text-center">
                      <svg className="mx-auto h-12 w-12 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-gray-600 mt-2">PDF Document Ready for Upload</p>
                    </div>
                  )}
                  
                  {filePreview.type === 'other' && (
                    <div className="bg-gray-50 p-4 rounded text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-gray-600 mt-2">File Ready for Upload</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Metadata Input */}
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full text-xs border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe this deliverable..."
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Version Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="What changed in this version..."
                  />
                </div>
              </div>
              
              {/* Upload Button */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={isUploading}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload Deliverable
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quality Standards Selection */}
        <div className="space-y-3">
          <h3 className="text-md font-medium text-gray-900">Quality Check Standards</h3>
          <div className="flex flex-wrap gap-2">
            {['completeness', 'accuracy', 'consistency', 'usability', 'maintainability', 'performance'].map((standard) => (
              <label key={standard} className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={selectedQualityStandards.includes(standard)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedQualityStandards(prev => [...prev, standard]);
                    } else {
                      setSelectedQualityStandards(prev => prev.filter(s => s !== standard));
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700 capitalize">{standard}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Existing Deliverables */}
        {deliverables.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-md font-medium text-gray-900">Existing Deliverables</h3>
            
            <div className="space-y-3">
              {deliverables.map((deliverable) => {
                const isExpanded = expandedDeliverables.has(deliverable.id);
                const isQualityCheckLoading = qualityCheckLoading[deliverable.id];
                
                return (
                  <div key={deliverable.id} className="border border-gray-200 rounded-lg">
                    {/* Deliverable Header */}
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-sm font-medium text-gray-900">{deliverable.fileName}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              deliverable.status === 'approved' ? 'bg-green-100 text-green-800' :
                              deliverable.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              deliverable.status === 'needs_revision' ? 'bg-yellow-100 text-yellow-800' :
                              deliverable.status === 'validating' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {deliverable.status.replace('_', ' ')}
                            </span>
                            {deliverable.qualityAssessment && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                QUALITY_SCORE_COLORS[getQualityScoreColor(deliverable.qualityAssessment.overallScore)]
                              }`}>
                                Score: {deliverable.qualityAssessment.overallScore}/100
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {deliverable.fileType} • {(deliverable.fileSize / 1024 / 1024).toFixed(2)} MB • 
                            v{deliverable.version} • {new Date(deliverable.submittedAt).toLocaleDateString()}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleQualityCheck(deliverable.id)}
                            disabled={isQualityCheckLoading}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 border border-blue-200 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {isQualityCheckLoading ? (
                              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-1" />
                            ) : (
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            Quality Check
                          </button>
                          
                          <button
                            onClick={() => toggleDeliverableExpansion(deliverable.id)}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {isExpanded ? 'Less' : 'Details'}
                            <svg
                              className={`w-3 h-3 ml-1 transform transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          
                          {onDeliverableDelete && (
                            <button
                              onClick={() => onDeliverableDelete(deliverable.id)}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-100 border border-red-200 rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <div className="pt-4 space-y-6">
                          {/* Quality Assessment Results */}
                          {deliverable.qualityAssessment && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div>
                                <h5 className="text-sm font-medium text-gray-900 mb-3">Quality Assessment</h5>
                                {renderQualityChart(deliverable.qualityAssessment)}
                              </div>
                              
                              <div>
                                <h5 className="text-sm font-medium text-gray-900 mb-3">Quality Gates</h5>
                                <div className="space-y-2">
                                  {deliverable.qualityAssessment.qualityGates.map((gate) => (
                                    <div key={gate.name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                      <div className="flex-1">
                                        <div className="text-xs font-medium text-gray-900">{gate.name}</div>
                                        <div className="text-xs text-gray-500">{gate.description}</div>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-gray-600">
                                          {gate.currentScore}/{gate.threshold}
                                        </span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                          gate.status === 'passed' ? 'bg-green-100 text-green-800' :
                                          gate.status === 'failed' ? 'bg-red-100 text-red-800' :
                                          'bg-yellow-100 text-yellow-800'
                                        }`}>
                                          {gate.status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Improvement Suggestions */}
                          {deliverable.qualityAssessment?.improvementSuggestions && 
                           deliverable.qualityAssessment.improvementSuggestions.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-900 mb-3">Improvement Suggestions</h5>
                              {renderImprovementSuggestions(deliverable.qualityAssessment.improvementSuggestions)}
                            </div>
                          )}

                          {/* Validation Results */}
                          {deliverable.validationResult && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-900 mb-3">Validation Results</h5>
                              {renderValidationResults(deliverable.validationResult)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};