import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskSubmissionForm } from '../components/work-task/WorkTaskSubmission';
import { Layout } from '../components/Layout';

export const WorkTaskSubmissionPage: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedTaskId, setSubmittedTaskId] = useState<string | null>(null);

  const handleSubmissionSuccess = (taskId: string) => {
    setSubmittedTaskId(taskId);
    setIsSubmitted(true);
    
    // Redirect to task analysis page after a short delay
    setTimeout(() => {
      navigate(`/work-tasks/${taskId}/analysis`);
    }, 2000);
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  const handleViewTask = () => {
    if (submittedTaskId) {
      navigate(`/work-tasks/${submittedTaskId}/analysis`);
    }
  };

  const handleSubmitAnother = () => {
    setIsSubmitted(false);
    setSubmittedTaskId(null);
  };

  if (isSubmitted) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Task Submitted Successfully!</h2>
            <p className="text-gray-600 mb-6">
              Your work task has been submitted for AI analysis. The system is now processing your request 
              and will generate detailed analysis results including key points, related workgroups, and a structured todo list.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <h3 className="text-sm font-medium text-blue-800">Task ID: {submittedTaskId}</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Analysis typically takes 1-3 minutes depending on task complexity.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleViewTask}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Analysis Results
              </button>
              
              <button
                onClick={handleSubmitAnother}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Submit Another Task
              </button>
              
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Submit Work Task</h1>
          <p className="mt-2 text-lg text-gray-600">
            Submit your work task for intelligent AI analysis and automated planning assistance.
          </p>
        </div>

        <TaskSubmissionForm
          onSubmit={handleSubmissionSuccess}
          onCancel={handleCancel}
        />
      </div>
    </Layout>
  );
};