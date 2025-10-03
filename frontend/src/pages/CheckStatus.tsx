import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CheckStatusResponse, Issue } from '../types';

interface ValidationReportProps {
  report: CheckStatusResponse['results'];
}

const ValidationReport: React.FC<ValidationReportProps> = ({ report }) => {
  if (!report) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-800 bg-red-100 border-red-200';
      case 'high':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'medium':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'low':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const groupedIssues = report.issues.reduce((acc, issue) => {
    if (!acc[issue.severity]) {
      acc[issue.severity] = [];
    }
    acc[issue.severity].push(issue);
    return acc;
  }, {} as Record<string, Issue[]>);

  return (
    <div className="space-y-6">
      {/* Score Overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Compliance Score</h3>
            <p className="text-sm text-gray-500">Overall artifact compliance rating</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getScoreColor(report.score)}`}>
              {report.score}%
            </div>
            <div className="text-sm text-gray-500">
              {report.issues.length} issues found
            </div>
          </div>
        </div>
        
        {/* Score Bar */}
        <div className="mt-4">
          <div className="bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${
                report.score >= 80 ? 'bg-green-500' : 
                report.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${report.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Issues by Severity */}
      {Object.entries(groupedIssues).map(([severity, issues]) => (
        <div key={severity} className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 capitalize">
                {severity} Issues
              </h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(severity)}`}>
                {issues.length}
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {issues.map((issue) => (
              <div key={issue.id} className="px-6 py-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      issue.severity === 'critical' ? 'bg-red-500' :
                      issue.severity === 'high' ? 'bg-red-400' :
                      issue.severity === 'medium' ? 'bg-yellow-400' :
                      'bg-blue-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900">
                        {issue.description}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        issue.type === 'security' ? 'bg-red-100 text-red-800' :
                        issue.type === 'semantic' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {issue.type}
                      </span>
                    </div>
                    {issue.location && (
                      <p className="text-sm text-gray-500 mt-1">
                        Location: <code className="bg-gray-100 px-1 rounded">{issue.location}</code>
                      </p>
                    )}
                    {issue.suggestion && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-sm text-blue-800">
                          <strong>Suggestion:</strong> {issue.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recommendations</h3>
          </div>
          <div className="px-6 py-4">
            <ul className="space-y-2">
              {report.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <svg className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700">{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Sources */}
      {report.sources.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Sources Referenced</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {report.sources.map((source) => (
              <div key={source.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">{source.type}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {Math.round(source.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{source.snippet}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const CheckStatus: React.FC = () => {
  const { jobId } = useParams<{ jobId?: string }>();
  const [selectedJob, setSelectedJob] = useState<string>(jobId || '');

  // Query for specific job status
  // @ts-ignore
  const { data: jobStatus, isLoading, error } = useQuery({
    queryKey: ['checkStatus', selectedJob],
    queryFn: async () => {
      if (!selectedJob) return null;
      
      // Use mock data for demonstration
      if (mockJobStatus[selectedJob]) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return mockJobStatus[selectedJob];
      }
      
      // Fallback to actual API call
      return api.getCheckStatus(selectedJob);
    },
    enabled: !!selectedJob,
    refetchInterval: (data) => {
      // Poll every 2 seconds if job is still processing
      return data?.status === 'processing' || data?.status === 'queued' ? 2000 : false;
    },
  });

  // Mock recent jobs for demonstration
  const recentJobs = [
    { id: 'job-123', name: 'Infrastructure Template', status: 'completed', timestamp: '2024-01-15T10:30:00Z' },
    { id: 'job-124', name: 'API Documentation', status: 'processing', timestamp: '2024-01-15T11:00:00Z' },
    { id: 'job-125', name: 'Security Policy', status: 'failed', timestamp: '2024-01-15T09:15:00Z' },
    { id: 'job-126', name: 'Deployment Configuration', status: 'queued', timestamp: '2024-01-15T11:30:00Z' },
  ];

  // Mock job status data for demonstration
  const mockJobStatus: Record<string, CheckStatusResponse> = {
    'job-123': {
      jobId: 'job-123',
      status: 'completed',
      progress: 100,
      results: {
        score: 85,
        issues: [
          {
            id: 'issue-1',
            severity: 'medium',
            type: 'static',
            description: 'Missing required tags in CloudFormation template',
            location: 'template.yaml:45',
            suggestion: 'Add Environment and Owner tags to all resources',
          },
          {
            id: 'issue-2',
            severity: 'low',
            type: 'semantic',
            description: 'Resource naming convention not followed',
            location: 'template.yaml:12',
            suggestion: 'Use kebab-case for resource names',
          },
        ],
        recommendations: [
          'Consider implementing automated tagging policies',
          'Review resource naming standards with your team',
          'Add validation rules for required metadata',
        ],
        sources: [
          {
            id: 'source-1',
            type: 'Company Policy',
            confidence: 0.95,
            snippet: 'All AWS resources must include Environment and Owner tags',
          },
          {
            id: 'source-2',
            type: 'Team Guidelines',
            confidence: 0.87,
            snippet: 'Resource names should follow kebab-case convention',
          },
        ],
      },
    },
    'job-124': {
      jobId: 'job-124',
      status: 'processing',
      progress: 65,
    },
    'job-125': {
      jobId: 'job-125',
      status: 'failed',
      error: 'Unable to parse document format. Please ensure the file is a valid PDF or Word document.',
    },
    'job-126': {
      jobId: 'job-126',
      status: 'queued',
      progress: 0,
    },
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'processing':
      case 'queued':
        return (
          <svg className="h-5 w-5 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'processing':
      case 'queued':
        return 'text-yellow-600 bg-yellow-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Check Status
          </h1>
          <p className="text-gray-600 mb-6">
            Monitor the status of your artifact verification jobs and view detailed compliance reports.
          </p>

          {/* Job Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Job
            </label>
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a job to view status...</option>
              {recentJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name} ({job.id}) - {job.status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Jobs
          </h3>
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                  selectedJob === job.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => setSelectedJob(job.id)}
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.name}</p>
                    <p className="text-sm text-gray-500">Job ID: {job.id}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(job.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job Status Details */}
      {selectedJob && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Job Details: {selectedJob}
              </h3>
              {jobStatus && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(jobStatus.status)}`}>
                  {jobStatus.status}
                </span>
              )}
            </div>

            {isLoading && (
              <div className="text-center py-8">
                <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="mt-2 text-sm text-gray-500">Loading job status...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <svg className="h-12 w-12 text-red-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2 text-sm text-red-600">Failed to load job status</p>
              </div>
            )}

            {jobStatus && (
              <div className="space-y-4">
                {/* Progress Bar */}
                {jobStatus.progress !== undefined && (
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{jobStatus.progress}%</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${jobStatus.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {jobStatus.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error</h3>
                        <p className="text-sm text-red-700 mt-1">{jobStatus.error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Processing Status */}
                {(jobStatus.status === 'processing' || jobStatus.status === 'queued') && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <svg className="h-5 w-5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          {jobStatus.status === 'queued' ? 'Queued' : 'Processing'}
                        </h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          {jobStatus.status === 'queued' 
                            ? 'Your job is queued and will start processing soon.'
                            : 'Your artifact is being analyzed. This may take a few minutes.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Validation Report */}
      {jobStatus?.results && jobStatus.status === 'completed' && (
        <ValidationReport report={jobStatus.results} />
      )}

      {/* No Job Selected */}
      {!selectedJob && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No job selected</h3>
          <p className="mt-1 text-sm text-gray-500">
            Select a job from the list above or{' '}
            <Link to="/upload" className="text-blue-600 hover:text-blue-500">
              upload a new artifact
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};