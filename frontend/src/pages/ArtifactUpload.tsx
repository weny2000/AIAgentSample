import React, { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import { JobResponse } from '../types';

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
}

const ARTIFACT_TYPES = [
  { value: 'infrastructure', label: 'Infrastructure Template', description: 'CloudFormation, Terraform, CDK templates' },
  { value: 'code', label: 'Source Code', description: 'Application code, scripts, configurations' },
  { value: 'documentation', label: 'Documentation', description: 'API docs, technical specifications, runbooks' },
  { value: 'policy', label: 'Policy Document', description: 'Security policies, compliance documents' },
  { value: 'configuration', label: 'Configuration File', description: 'Application configs, deployment manifests' },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = [
  '.json', '.yaml', '.yml', '.tf', '.py', '.js', '.ts', '.md', '.txt', '.pdf', '.docx'
];

export const ArtifactUpload: React.FC = () => {
  const navigate = useNavigate();
  const { addNotification, setCurrentJobId } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  // const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; type: string }) => {
      const response = await api.checkArtifact(data);
      return response as JobResponse;
    },
    onSuccess: (data) => {
      addNotification({
        type: 'success',
        title: 'Upload Successful',
        message: `Artifact uploaded successfully. Job ID: ${data.jobId}`,
      });
      setCurrentJobId(data.jobId);
      navigate(`/status/${data.jobId}`);
    },
    onError: (error: Error) => {
      addNotification({
        type: 'error',
        title: 'Upload Failed',
        message: error.message || 'Failed to upload artifact',
      });
    },
  });

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }

    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_FILE_TYPES.includes(extension)) {
      return `File type not supported. Accepted types: ${ACCEPTED_FILE_TYPES.join(', ')}`;
    }

    return null;
  };

  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    const newFiles: UploadedFile[] = [];

    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        addNotification({
          type: 'error',
          title: 'Invalid File',
          message: `${file.name}: ${error}`,
        });
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      const uploadedFile: UploadedFile = {
        file,
        id,
      };

      // Create preview for text files
      if (file.type.startsWith('text/') || file.name.endsWith('.json') || file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          uploadedFile.preview = content.substring(0, 500) + (content.length > 500 ? '...' : '');
          setFiles(prev => prev.map(f => f.id === id ? uploadedFile : f));
        };
        reader.readAsText(file);
      }

      newFiles.push(uploadedFile);
    });

    setFiles(prev => [...prev, ...newFiles]);
  }, [addNotification]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      addNotification({
        type: 'warning',
        title: 'No Files Selected',
        message: 'Please select at least one file to upload',
      });
      return;
    }

    if (!selectedType) {
      addNotification({
        type: 'warning',
        title: 'Artifact Type Required',
        message: 'Please select an artifact type',
      });
      return;
    }

    // For now, upload the first file. In a real implementation, you might handle multiple files
    const fileToUpload = files[0];
    uploadMutation.mutate({
      file: fileToUpload.file,
      type: selectedType,
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Upload Artifact
          </h1>
          <p className="text-gray-600 mb-6">
            Upload documents, code, or configurations for automated verification and compliance checking.
          </p>

          {/* Artifact Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Artifact Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select artifact type...</option>
              {ARTIFACT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="mt-1 text-sm text-gray-500">
                {ARTIFACT_TYPES.find(t => t.value === selectedType)?.description}
              </p>
            )}
          </div>

          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Upload artifacts</h3>
            <p className="mt-1 text-sm text-gray-500">
              Drag and drop files here, or click to select files
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Supported formats: {ACCEPTED_FILE_TYPES.join(', ')} (max {MAX_FILE_SIZE / 1024 / 1024}MB)
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Select Files
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILE_TYPES.join(',')}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Files</h3>
              <div className="space-y-4">
                {files.map((uploadedFile) => (
                  <div key={uploadedFile.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{uploadedFile.file.name}</p>
                            <p className="text-sm text-gray-500">
                              {formatFileSize(uploadedFile.file.size)} • {uploadedFile.file.type || 'Unknown type'}
                            </p>
                          </div>
                        </div>
                        {uploadedFile.preview && (
                          <div className="mt-3 p-3 bg-gray-50 rounded border">
                            <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                              {uploadedFile.preview}
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeFile(uploadedFile.id)}
                        className="ml-4 text-red-600 hover:text-red-800"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploadMutation.isPending || !selectedType}
                className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadMutation.isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Start Verification
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};