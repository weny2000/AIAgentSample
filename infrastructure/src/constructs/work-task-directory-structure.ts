/**
 * Work Task Analysis S3 Directory Structure Configuration
 * 
 * This file defines the standardized directory structure for the work task analysis system
 * as specified in the design document. The structure supports organized storage of:
 * - Task content and analysis results
 * - Deliverable files and validation reports
 * - Progress reports and quality assessments
 */

export interface WorkTaskDirectoryStructure {
  tasks: TaskDirectoryStructure;
  deliverables: DeliverableDirectoryStructure;
  reports: ReportDirectoryStructure;
  temp: TempDirectoryStructure;
}

export interface TaskDirectoryStructure {
  basePath: string;
  subDirectories: {
    originalContent: string;
    analysisResult: string;
    attachments: string;
  };
}

export interface DeliverableDirectoryStructure {
  basePath: string;
  subDirectories: {
    originalFile: string;
    validationReport: string;
    qualityAssessment: string;
  };
}

export interface ReportDirectoryStructure {
  basePath: string;
  subDirectories: {
    progressReports: string;
    qualityReports: string;
    summaryReports: string;
  };
}

export interface TempDirectoryStructure {
  basePath: string;
  subDirectories: {
    uploads: string;
    processing: string;
    cache: string;
  };
}

/**
 * Standard directory structure configuration for work task analysis
 * Based on the design document specification:
 * 
 * work-task-analysis-bucket/
 * ├── tasks/
 * │   ├── {task_id}/
 * │   │   ├── original_content.json
 * │   │   ├── analysis_result.json
 * │   │   └── attachments/
 * │   │       ├── {attachment_id}.{ext}
 * │   │       └── ...
 * ├── deliverables/
 * │   ├── {todo_id}/
 * │   │   ├── {deliverable_id}/
 * │   │   │   ├── original_file.{ext}
 * │   │   │   ├── validation_report.json
 * │   │   │   └── quality_assessment.json
 * ├── reports/
 * │   ├── progress_reports/
 * │   │   └── {task_id}_{timestamp}.json
 * │   └── quality_reports/
 * │       └── {deliverable_id}_{timestamp}.json
 * └── temp/
 *     ├── uploads/
 *     ├── processing/
 *     └── cache/
 */
export const WORK_TASK_DIRECTORY_STRUCTURE: WorkTaskDirectoryStructure = {
  tasks: {
    basePath: 'tasks',
    subDirectories: {
      originalContent: 'original_content.json',
      analysisResult: 'analysis_result.json',
      attachments: 'attachments',
    },
  },
  deliverables: {
    basePath: 'deliverables',
    subDirectories: {
      originalFile: 'original_file',
      validationReport: 'validation_report.json',
      qualityAssessment: 'quality_assessment.json',
    },
  },
  reports: {
    basePath: 'reports',
    subDirectories: {
      progressReports: 'progress_reports',
      qualityReports: 'quality_reports',
      summaryReports: 'summary_reports',
    },
  },
  temp: {
    basePath: 'temp',
    subDirectories: {
      uploads: 'uploads',
      processing: 'processing',
      cache: 'cache',
    },
  },
};

/**
 * Utility functions for generating S3 keys based on the directory structure
 */
export class WorkTaskS3KeyGenerator {
  /**
   * Generate S3 key for task original content
   */
  static getTaskOriginalContentKey(taskId: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/${taskId}/${WORK_TASK_DIRECTORY_STRUCTURE.tasks.subDirectories.originalContent}`;
  }

  /**
   * Generate S3 key for task analysis result
   */
  static getTaskAnalysisResultKey(taskId: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/${taskId}/${WORK_TASK_DIRECTORY_STRUCTURE.tasks.subDirectories.analysisResult}`;
  }

  /**
   * Generate S3 key for task attachment
   */
  static getTaskAttachmentKey(taskId: string, attachmentId: string, extension: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/${taskId}/${WORK_TASK_DIRECTORY_STRUCTURE.tasks.subDirectories.attachments}/${attachmentId}.${extension}`;
  }

  /**
   * Generate S3 key for deliverable original file
   */
  static getDeliverableOriginalFileKey(todoId: string, deliverableId: string, extension: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/${todoId}/${deliverableId}/${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.subDirectories.originalFile}.${extension}`;
  }

  /**
   * Generate S3 key for deliverable validation report
   */
  static getDeliverableValidationReportKey(todoId: string, deliverableId: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/${todoId}/${deliverableId}/${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.subDirectories.validationReport}`;
  }

  /**
   * Generate S3 key for deliverable quality assessment
   */
  static getDeliverableQualityAssessmentKey(todoId: string, deliverableId: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/${todoId}/${deliverableId}/${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.subDirectories.qualityAssessment}`;
  }

  /**
   * Generate S3 key for progress report
   */
  static getProgressReportKey(taskId: string, timestamp: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.progressReports}/${taskId}_${timestamp}.json`;
  }

  /**
   * Generate S3 key for quality report
   */
  static getQualityReportKey(deliverableId: string, timestamp: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.qualityReports}/${deliverableId}_${timestamp}.json`;
  }

  /**
   * Generate S3 key for summary report
   */
  static getSummaryReportKey(reportType: string, entityId: string, timestamp: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.reports.subDirectories.summaryReports}/${reportType}_${entityId}_${timestamp}.json`;
  }

  /**
   * Generate S3 key for temporary upload
   */
  static getTempUploadKey(uploadId: string, extension: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.uploads}/${uploadId}.${extension}`;
  }

  /**
   * Generate S3 key for temporary processing file
   */
  static getTempProcessingKey(processingId: string, extension: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.processing}/${processingId}.${extension}`;
  }

  /**
   * Generate S3 key for cache file
   */
  static getCacheKey(cacheId: string, extension: string): string {
    return `${WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath}/${WORK_TASK_DIRECTORY_STRUCTURE.temp.subDirectories.cache}/${cacheId}.${extension}`;
  }

  /**
   * Extract task ID from S3 key
   */
  static extractTaskIdFromKey(s3Key: string): string | null {
    const taskPattern = new RegExp(`^${WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath}/([^/]+)/`);
    const match = s3Key.match(taskPattern);
    return match ? match[1] : null;
  }

  /**
   * Extract todo ID and deliverable ID from S3 key
   */
  static extractDeliverableIdsFromKey(s3Key: string): { todoId: string; deliverableId: string } | null {
    const deliverablePattern = new RegExp(`^${WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath}/([^/]+)/([^/]+)/`);
    const match = s3Key.match(deliverablePattern);
    return match ? { todoId: match[1], deliverableId: match[2] } : null;
  }

  /**
   * Validate S3 key format
   */
  static validateS3Key(s3Key: string): { isValid: boolean; type: string | null; error?: string } {
    // Check if key matches task pattern
    if (s3Key.startsWith(WORK_TASK_DIRECTORY_STRUCTURE.tasks.basePath)) {
      const taskId = this.extractTaskIdFromKey(s3Key);
      if (!taskId) {
        return { isValid: false, type: null, error: 'Invalid task key format' };
      }
      return { isValid: true, type: 'task' };
    }

    // Check if key matches deliverable pattern
    if (s3Key.startsWith(WORK_TASK_DIRECTORY_STRUCTURE.deliverables.basePath)) {
      const ids = this.extractDeliverableIdsFromKey(s3Key);
      if (!ids) {
        return { isValid: false, type: null, error: 'Invalid deliverable key format' };
      }
      return { isValid: true, type: 'deliverable' };
    }

    // Check if key matches report pattern
    if (s3Key.startsWith(WORK_TASK_DIRECTORY_STRUCTURE.reports.basePath)) {
      return { isValid: true, type: 'report' };
    }

    // Check if key matches temp pattern
    if (s3Key.startsWith(WORK_TASK_DIRECTORY_STRUCTURE.temp.basePath)) {
      return { isValid: true, type: 'temp' };
    }

    return { isValid: false, type: null, error: 'Key does not match any known pattern' };
  }
}

/**
 * File type configurations for different categories
 */
export const WORK_TASK_FILE_TYPES = {
  // Allowed file types for task attachments
  taskAttachments: [
    '.txt', '.md', '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.zip', '.tar.gz', '.json', '.xml', '.csv'
  ],
  
  // Allowed file types for deliverables
  deliverables: [
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.md',
    '.zip', '.tar.gz', '.json', '.xml', '.csv', '.jpg', '.jpeg', '.png', '.gif',
    '.mp4', '.avi', '.mov', '.wmv', '.sql', '.py', '.js', '.ts', '.java', '.cpp', '.c'
  ],
  
  // File types for reports (system generated)
  reports: ['.json', '.pdf', '.html', '.csv', '.xlsx'],
  
  // Maximum file sizes (in bytes)
  maxFileSizes: {
    taskAttachment: 10 * 1024 * 1024, // 10 MB
    deliverable: 100 * 1024 * 1024, // 100 MB
    report: 50 * 1024 * 1024, // 50 MB
    temp: 200 * 1024 * 1024, // 200 MB
  },
};

/**
 * Security configurations for different file types
 */
export const WORK_TASK_SECURITY_CONFIG = {
  // Files that require virus scanning
  virusScanRequired: [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js', '.jar',
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.docx', '.xlsx', '.pptx'
  ],
  
  // Files that are blocked for security reasons
  blockedFileTypes: [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.hta', '.msi',
    '.dll', '.sys', '.drv', '.ocx', '.cpl', '.inf', '.reg'
  ],
  
  // Content types that require additional validation
  contentValidationRequired: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed'
  ],
};