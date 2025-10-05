import React, { useState } from 'react';
import { TodoListManager } from '../components/work-task';
import { TodoItem, ProgressSummary, QualityAssessmentResult } from '../types/work-task';

// Mock data for demonstration
const mockTodos: TodoItem[] = [
  {
    id: 'todo-1',
    title: 'Research API Requirements',
    description: 'Investigate the API requirements for the new feature implementation',
    priority: 'high',
    estimatedHours: 8,
    dependencies: [],
    category: 'research',
    status: 'pending',
    relatedWorkgroups: ['backend-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
  {
    id: 'todo-2',
    title: 'Implement Core Logic',
    description: 'Develop the core business logic for the feature with proper error handling',
    priority: 'critical',
    estimatedHours: 16,
    dependencies: ['todo-1'],
    category: 'development',
    status: 'in_progress',
    relatedWorkgroups: ['backend-team', 'frontend-team'],
    deliverables: [
      {
        id: 'deliverable-1',
        fileName: 'core-logic.ts',
        fileType: 'typescript',
        fileSize: 2048,
        status: 'submitted',
        submittedAt: new Date(),
        submittedBy: 'user-1',
        version: 1,
        qualityAssessment: {
          id: 'qa-1',
          deliverableId: 'deliverable-1',
          assessedAt: new Date(),
          assessedBy: 'system',
          overallScore: 85,
          qualityDimensions: [],
          improvementSuggestions: [],
          qualityGates: [],
        },
      },
    ],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 60,
      timeSpentHours: 10,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
  {
    id: 'todo-3',
    title: 'Write Unit Tests',
    description: 'Create comprehensive unit tests for the implemented logic',
    priority: 'medium',
    estimatedHours: 6,
    dependencies: ['todo-2'],
    category: 'testing',
    status: 'blocked',
    relatedWorkgroups: ['qa-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [
        {
          id: 'issue-1',
          description: 'Waiting for core logic completion',
          severity: 'medium',
          reportedAt: new Date(),
        },
      ],
      statusHistory: [],
    },
  },
  {
    id: 'todo-4',
    title: 'Code Review',
    description: 'Conduct thorough code review with the team',
    priority: 'medium',
    estimatedHours: 4,
    dependencies: ['todo-2', 'todo-3'],
    category: 'review',
    status: 'pending',
    relatedWorkgroups: ['backend-team', 'qa-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
  {
    id: 'todo-5',
    title: 'Documentation',
    description: 'Write comprehensive documentation for the new feature',
    priority: 'low',
    estimatedHours: 3,
    dependencies: ['todo-4'],
    category: 'documentation',
    status: 'pending',
    relatedWorkgroups: ['documentation-team'],
    deliverables: [],
    qualityChecks: [],
    progressTracking: {
      completionPercentage: 0,
      timeSpentHours: 0,
      lastActivityAt: new Date(),
      blockingIssues: [],
      statusHistory: [],
    },
  },
];

const mockProgressSummary: ProgressSummary = {
  taskId: 'task-1',
  overallProgress: 32,
  completedTodos: 0,
  totalTodos: 5,
  averageQualityScore: 85,
  riskIndicators: [
    {
      name: 'Dependency Risk',
      currentValue: 0.6,
      thresholdValue: 0.8,
      trend: 'stable',
      severity: 'medium',
      description: 'Some tasks are blocked by dependencies',
    },
  ],
  upcomingDeadlines: [
    {
      todoId: 'todo-2',
      todoTitle: 'Implement Core Logic',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      daysRemaining: 3,
      status: 'in_progress',
      riskLevel: 'medium',
    },
  ],
  recentActivity: [],
};

export const TodoListDemo: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>(mockTodos);
  const [progressSummary] = useState<ProgressSummary>(mockProgressSummary);

  const handleStatusUpdate = async (todoId: string, updates: any) => {
    console.log('Status update:', todoId, updates);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setTodos(prevTodos =>
      prevTodos.map(todo =>
        todo.id === todoId
          ? {
              ...todo,
              status: updates.status || todo.status,
              progressTracking: {
                ...todo.progressTracking!,
                completionPercentage: updates.status === 'completed' ? 100 : 
                                    updates.status === 'in_progress' ? 50 : 0,
              },
            }
          : todo
      )
    );
  };

  const handleDeliverableSubmit = async (todoId: string, file: File, metadata?: any) => {
    console.log('Deliverable submit:', todoId, file.name, metadata);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newDeliverable = {
      id: `deliverable-${Date.now()}`,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: 'submitted' as const,
      submittedAt: new Date(),
      submittedBy: 'current-user',
      version: 1,
    };

    setTodos(prevTodos =>
      prevTodos.map(todo =>
        todo.id === todoId
          ? {
              ...todo,
              deliverables: [...(todo.deliverables || []), newDeliverable],
            }
          : todo
      )
    );
  };

  const handleQualityCheck = async (deliverableId: string): Promise<QualityAssessmentResult> => {
    console.log('Quality check:', deliverableId);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockResult: QualityAssessmentResult = {
      id: `qa-${Date.now()}`,
      deliverableId,
      assessedAt: new Date(),
      assessedBy: 'system',
      overallScore: Math.floor(Math.random() * 30) + 70, // Random score between 70-100
      qualityDimensions: [],
      improvementSuggestions: [],
      qualityGates: [],
    };

    // Update the deliverable with quality assessment
    setTodos(prevTodos =>
      prevTodos.map(todo => ({
        ...todo,
        deliverables: todo.deliverables?.map(deliverable =>
          deliverable.id === deliverableId
            ? { ...deliverable, qualityAssessment: mockResult }
            : deliverable
        ),
      }))
    );

    return mockResult;
  };

  const handleReorderTodos = async (reorderedTodos: TodoItem[]) => {
    console.log('Reorder todos:', reorderedTodos.map(t => t.title));
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setTodos(reorderedTodos);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Todo List Manager Demo</h1>
          <p className="mt-2 text-lg text-gray-600">
            Interactive demonstration of the TodoListManager component with drag-and-drop, 
            deliverable management, and progress tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Features Demonstrated</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900">Status Management</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Update todo status with real-time progress tracking
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-900">Deliverable Upload</h3>
                <p className="text-sm text-green-700 mt-1">
                  Submit files and track deliverable status
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-900">Quality Checks</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Automated quality assessment with scoring
                </p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <h3 className="font-medium text-orange-900">Dependency Tracking</h3>
                <p className="text-sm text-orange-700 mt-1">
                  Visual dependency relationships between tasks
                </p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <h3 className="font-medium text-red-900">Drag & Drop</h3>
                <p className="text-sm text-red-700 mt-1">
                  Reorder todos with drag-and-drop interface
                </p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-medium text-yellow-900">Progress Visualization</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Real-time progress bars and completion tracking
                </p>
              </div>
            </div>
          </div>

          <TodoListManager
            taskId="demo-task"
            todos={todos}
            progressSummary={progressSummary}
            onStatusUpdate={handleStatusUpdate}
            onDeliverableSubmit={handleDeliverableSubmit}
            onQualityCheck={handleQualityCheck}
            onReorderTodos={handleReorderTodos}
          />

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Instructions</h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-blue-600">1</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Change Status</h3>
                  <p className="text-sm text-gray-600">
                    Use the dropdown to change todo status. Watch the progress bar update automatically.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-green-600">2</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Expand Details</h3>
                  <p className="text-sm text-gray-600">
                    Click "More" to expand todo details and access deliverable upload functionality.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-purple-600">3</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Upload Files</h3>
                  <p className="text-sm text-gray-600">
                    Select a file and click "Upload" to submit deliverables for quality checking.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-orange-600">4</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Quality Check</h3>
                  <p className="text-sm text-gray-600">
                    Click "Check Quality" on submitted deliverables to run automated quality assessment.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-red-600">5</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Reorder Tasks</h3>
                  <p className="text-sm text-gray-600">
                    Drag and drop todo items to reorder them. The changes will be saved automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};