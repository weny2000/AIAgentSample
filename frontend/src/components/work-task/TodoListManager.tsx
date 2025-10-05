import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  TodoItem, 
  TodoUpdateRequest, 
  DeliverableSubmissionRequest,
  ProgressSummary,
  QualityAssessmentResult 
} from '../../types/work-task';

interface TodoListManagerProps {
  taskId: string;
  todos: TodoItem[];
  progressSummary?: ProgressSummary;
  onStatusUpdate: (todoId: string, updates: TodoUpdateRequest) => Promise<void>;
  onDeliverableSubmit: (todoId: string, file: File, metadata?: any) => Promise<void>;
  onQualityCheck: (deliverableId: string) => Promise<QualityAssessmentResult>;
  onReorderTodos?: (reorderedTodos: TodoItem[]) => Promise<void>;
  className?: string;
}

interface DragState {
  isDragging: boolean;
  draggedIndex: number | null;
  dragOverIndex: number | null;
}

const TODO_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800 border-gray-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  blocked: 'bg-red-100 text-red-800 border-red-300',
} as const;

const PRIORITY_COLORS = {
  low: 'bg-gray-50 border-l-gray-400',
  medium: 'bg-yellow-50 border-l-yellow-400',
  high: 'bg-orange-50 border-l-orange-400',
  critical: 'bg-red-50 border-l-red-400',
} as const;

const CATEGORY_ICONS = {
  research: '🔍',
  development: '💻',
  review: '👀',
  approval: '✅',
  documentation: '📝',
  testing: '🧪',
} as const;

export const TodoListManager: React.FC<TodoListManagerProps> = ({
  taskId,
  todos,
  progressSummary,
  onStatusUpdate,
  onDeliverableSubmit,
  onQualityCheck,
  onReorderTodos,
  className = '',
}) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedIndex: null,
    dragOverIndex: null,
  });
  
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [selectedTodo, setSelectedTodo] = useState<string | null>(null);
  const [deliverableFiles, setDeliverableFiles] = useState<Record<string, File | null>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Handle drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!onReorderTodos) return;
    
    setDragState({
      isDragging: true,
      draggedIndex: index,
      dragOverIndex: null,
    });
    
    // Check if dataTransfer exists (for test environment compatibility)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
    }
  }, [onReorderTodos]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!dragState.isDragging) return;
    
    e.preventDefault();
    
    // Check if dataTransfer exists (for test environment compatibility)
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    
    setDragState(prev => ({
      ...prev,
      dragOverIndex: index,
    }));
  }, [dragState.isDragging]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (!onReorderTodos || dragState.draggedIndex === null) return;
    
    const draggedIndex = dragState.draggedIndex;
    if (draggedIndex === dropIndex) {
      setDragState({ isDragging: false, draggedIndex: null, dragOverIndex: null });
      return;
    }

    const reorderedTodos = [...todos];
    const [draggedTodo] = reorderedTodos.splice(draggedIndex, 1);
    reorderedTodos.splice(dropIndex, 0, draggedTodo);

    onReorderTodos(reorderedTodos);
    setDragState({ isDragging: false, draggedIndex: null, dragOverIndex: null });
  }, [todos, dragState.draggedIndex, onReorderTodos]);

  const handleDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedIndex: null, dragOverIndex: null });
  }, []);

  // Toggle todo expansion
  const toggleTodoExpansion = useCallback((todoId: string) => {
    setExpandedTodos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(todoId)) {
        newSet.delete(todoId);
      } else {
        newSet.add(todoId);
      }
      return newSet;
    });
  }, []);

  // Handle status updates
  const handleStatusUpdate = useCallback(async (todoId: string, newStatus: TodoItem['status']) => {
    setLoadingStates(prev => ({ ...prev, [`status-${todoId}`]: true }));
    
    try {
      await onStatusUpdate(todoId, { status: newStatus });
    } catch (error) {
      console.error('Failed to update todo status:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`status-${todoId}`]: false }));
    }
  }, [onStatusUpdate]);

  // Handle file selection
  const handleFileSelect = useCallback((todoId: string, file: File | null) => {
    setDeliverableFiles(prev => ({ ...prev, [todoId]: file }));
  }, []);

  // Handle deliverable submission
  const handleDeliverableSubmit = useCallback(async (todoId: string) => {
    const file = deliverableFiles[todoId];
    if (!file) return;

    setLoadingStates(prev => ({ ...prev, [`deliverable-${todoId}`]: true }));
    
    try {
      await onDeliverableSubmit(todoId, file);
      setDeliverableFiles(prev => ({ ...prev, [todoId]: null }));
      
      // Reset file input
      if (fileInputRefs.current[todoId]) {
        fileInputRefs.current[todoId]!.value = '';
      }
    } catch (error) {
      console.error('Failed to submit deliverable:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`deliverable-${todoId}`]: false }));
    }
  }, [deliverableFiles, onDeliverableSubmit]);

  // Handle quality check
  const handleQualityCheck = useCallback(async (deliverableId: string) => {
    setLoadingStates(prev => ({ ...prev, [`quality-${deliverableId}`]: true }));
    
    try {
      await onQualityCheck(deliverableId);
    } catch (error) {
      console.error('Failed to perform quality check:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`quality-${deliverableId}`]: false }));
    }
  }, [onQualityCheck]);

  // Calculate progress percentage
  const calculateProgress = useCallback((todo: TodoItem): number => {
    if (todo.status === 'completed') return 100;
    if (todo.status === 'in_progress') {
      return todo.progressTracking?.completionPercentage || 25;
    }
    return 0;
  }, []);

  // Get dependency status
  const getDependencyStatus = useCallback((dependencyId: string): 'met' | 'pending' | 'blocked' => {
    const dependencyTodo = todos.find(t => t.id === dependencyId);
    if (!dependencyTodo) return 'pending';
    
    if (dependencyTodo.status === 'completed') return 'met';
    if (dependencyTodo.status === 'blocked') return 'blocked';
    return 'pending';
  }, [todos]);

  // Render dependency visualization
  const renderDependencies = useCallback((todo: TodoItem) => {
    if (todo.dependencies.length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-md">
        <h5 className="text-xs font-medium text-gray-700 mb-2">Dependencies</h5>
        <div className="space-y-1">
          {todo.dependencies.map(depId => {
            const depTodo = todos.find(t => t.id === depId);
            const status = getDependencyStatus(depId);
            
            return (
              <div key={depId} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  {depTodo ? depTodo.title : `Task ${depId}`}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  status === 'met' ? 'bg-green-100 text-green-800' :
                  status === 'blocked' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [todos, getDependencyStatus]);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Todo List</h2>
            <p className="text-sm text-gray-600 mt-1">
              Track progress and manage deliverables for your work task
            </p>
          </div>
          {progressSummary && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {progressSummary.completedTodos} / {progressSummary.totalTodos} completed
                </div>
                <div className="text-xs text-gray-500">
                  {Math.round(progressSummary.overallProgress)}% overall progress
                </div>
              </div>
              <div className="w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-gray-200"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-600"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${progressSummary.overallProgress}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Todo List */}
      <div className="p-6">
        {todos.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No todos yet</h3>
            <p className="text-gray-600">
              Todo items will appear here once the task analysis is complete.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {todos.map((todo, index) => {
              const isExpanded = expandedTodos.has(todo.id);
              const progress = calculateProgress(todo);
              const isDraggedOver = dragState.dragOverIndex === index;
              const isDragged = dragState.draggedIndex === index;
              
              return (
                <div
                  key={todo.id}
                  draggable={!!onReorderTodos}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`border rounded-lg transition-all duration-200 ${
                    PRIORITY_COLORS[todo.priority]
                  } border-l-4 ${
                    isDragged ? 'opacity-50 scale-95' : ''
                  } ${
                    isDraggedOver ? 'border-blue-300 bg-blue-50' : ''
                  } ${
                    onReorderTodos ? 'cursor-move hover:shadow-md' : ''
                  }`}
                >
                  {/* Todo Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-lg">{CATEGORY_ICONS[todo.category]}</span>
                          <h3 className="text-sm font-medium text-gray-900">{todo.title}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            TODO_STATUS_COLORS[todo.status]
                          }`}>
                            {todo.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {todo.estimatedHours}h estimated
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3">{todo.description}</p>
                        
                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700">Progress</span>
                            <span className="text-xs text-gray-500">{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                todo.status === 'completed' ? 'bg-green-500' :
                                todo.status === 'blocked' ? 'bg-red-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center space-x-2">
                          {todo.status !== 'completed' && (
                            <>
                              <select
                                value={todo.status}
                                onChange={(e) => handleStatusUpdate(todo.id, e.target.value as TodoItem['status'])}
                                disabled={loadingStates[`status-${todo.id}`]}
                                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="blocked">Blocked</option>
                              </select>
                              
                              {loadingStates[`status-${todo.id}`] && (
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              )}
                            </>
                          )}
                          
                          <button
                            onClick={() => toggleTodoExpansion(todo.id)}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {isExpanded ? 'Less' : 'More'}
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
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="pt-4 space-y-4">
                        {/* Dependencies */}
                        {renderDependencies(todo)}

                        {/* Deliverable Upload */}
                        <div className="p-3 bg-blue-50 rounded-md">
                          <h5 className="text-xs font-medium text-gray-700 mb-2">Submit Deliverable</h5>
                          <div className="flex items-center space-x-2">
                            <input
                              ref={(el) => { fileInputRefs.current[todo.id] = el; }}
                              type="file"
                              onChange={(e) => handleFileSelect(todo.id, e.target.files?.[0] || null)}
                              className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                            />
                            <button
                              onClick={() => handleDeliverableSubmit(todo.id)}
                              disabled={!deliverableFiles[todo.id] || loadingStates[`deliverable-${todo.id}`]}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingStates[`deliverable-${todo.id}`] ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                              ) : (
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              )}
                              Upload
                            </button>
                          </div>
                        </div>

                        {/* Existing Deliverables */}
                        {todo.deliverables && todo.deliverables.length > 0 && (
                          <div className="p-3 bg-green-50 rounded-md">
                            <h5 className="text-xs font-medium text-gray-700 mb-2">Deliverables</h5>
                            <div className="space-y-2">
                              {todo.deliverables.map((deliverable) => (
                                <div key={deliverable.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs font-medium text-gray-900">{deliverable.fileName}</span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        deliverable.status === 'approved' ? 'bg-green-100 text-green-800' :
                                        deliverable.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                        deliverable.status === 'needs_revision' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {deliverable.status.replace('_', ' ')}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      Submitted: {new Date(deliverable.submittedAt).toLocaleDateString()}
                                      {deliverable.qualityAssessment && (
                                        <span className="ml-2">
                                          Quality Score: {deliverable.qualityAssessment.overallScore}/100
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleQualityCheck(deliverable.id)}
                                    disabled={loadingStates[`quality-${deliverable.id}`]}
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 border border-blue-200 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                  >
                                    {loadingStates[`quality-${deliverable.id}`] ? (
                                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      'Check Quality'
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Related Workgroups */}
                        {todo.relatedWorkgroups.length > 0 && (
                          <div className="p-3 bg-purple-50 rounded-md">
                            <h5 className="text-xs font-medium text-gray-700 mb-2">Related Workgroups</h5>
                            <div className="flex flex-wrap gap-1">
                              {todo.relatedWorkgroups.map((workgroupId) => (
                                <span
                                  key={workgroupId}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
                                >
                                  {workgroupId}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Progress Tracking Details */}
                        {todo.progressTracking && (
                          <div className="p-3 bg-gray-50 rounded-md">
                            <h5 className="text-xs font-medium text-gray-700 mb-2">Progress Details</h5>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-gray-600">Time Spent:</span>
                                <span className="ml-1 font-medium">{todo.progressTracking.timeSpentHours}h</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Last Activity:</span>
                                <span className="ml-1 font-medium">
                                  {new Date(todo.progressTracking.lastActivityAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            
                            {todo.progressTracking.blockingIssues.length > 0 && (
                              <div className="mt-2">
                                <span className="text-xs font-medium text-red-700">Blocking Issues:</span>
                                <div className="mt-1 space-y-1">
                                  {todo.progressTracking.blockingIssues.map((issue) => (
                                    <div key={issue.id} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                                      {issue.description}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};