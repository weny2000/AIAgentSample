# Training and questions models
# Based on architecture design section 5: Data & Storage

from sqlmodel import Field, Relationship
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
import uuid
from app.database.base import BaseTable


class QuestionType(str, Enum):
    """Types of training questions"""
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    SHORT_ANSWER = "SHORT_ANSWER"
    ESSAY = "ESSAY"
    PRACTICAL = "PRACTICAL"


class QuestionStatus(str, Enum):
    """Question approval status"""
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    DEPRECATED = "DEPRECATED"
    DELETED = "DELETED"


class DifficultyLevel(str, Enum):
    """Question difficulty levels"""
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"
    EXPERT = "EXPERT"


class Question(BaseTable, table=True):
    """
    Questions (Logical)
    Represents logical questions that can have multiple versions
    """
    __tablename__ = "questions"
    
    title: str = Field(max_length=500, description="Question title/summary")
    description: Optional[str] = Field(default=None, max_length=1000, description="Question description")
    
    # Creator information
    creator_user_id: uuid.UUID = Field(description="User who created this question")
    
    # Question categorization
    category: Optional[str] = Field(default=None, max_length=100, description="Question category")
    tags: Optional[str] = Field(default=None, description="Tags for categorization - JSON string")
    
    # Status
    is_active: bool = Field(default=True, description="Whether question is active")
    
    # Relationships
    versions: List["QuestionVersion"] = Relationship(back_populates="question")


class QuestionVersion(BaseTable, table=True):
    """
    Question Versions
    Specific versions of questions with content and metadata
    """
    __tablename__ = "question_versions"
    
    # Parent question
    logical_question_id: uuid.UUID = Field(foreign_key="questions.id", description="Parent logical question")
    question: Question = Relationship(back_populates="versions")
    
    # Version information
    version_number: str = Field(max_length=50, description="Version identifier")
    is_latest_approved: bool = Field(default=False, description="Whether this is the latest approved version")
    
    # Question content
    question_text: str = Field(description="The actual question text")
    question_type: QuestionType = Field(description="Type of question")
    
    # Question options (for multiple choice, etc.)
    options: Optional[str] = Field(
        default=None, 
        description="Question options/choices - JSON string"
    )
    
    # Correct answers and scoring
    correct_answer: Optional[str] = Field(
        default=None, 
        description="Correct answer(s) - JSON string"
    )
    
    scoring_rubric: Optional[str] = Field(
        default=None, 
        max_length=2000, 
        description="Scoring rubric/criteria"
    )
    
    scoring_prompt: Optional[str] = Field(
        default=None, 
        max_length=1000, 
        description="AI scoring prompt for automated grading"
    )
    
    # Knowledge source associations
    source_version_ids: Optional[str] = Field(
        default=None, 
        description="Associated knowledge source version IDs - JSON string"
    )
    
    snapshot_ids: Optional[str] = Field(
        default=None, 
        description="Associated sync snapshot IDs - JSON string"
    )
    
    # Question metadata
    difficulty_level: Optional[DifficultyLevel] = Field(default=None, description="Question difficulty")
    estimated_time_minutes: Optional[int] = Field(default=None, description="Estimated completion time")
    points: Optional[int] = Field(default=1, description="Points awarded for correct answer")
    
    # Approval workflow
    status: QuestionStatus = Field(default=QuestionStatus.DRAFT, description="Question status")
    approved_by: Optional[uuid.UUID] = Field(default=None, description="User who approved this version")
    approved_at: Optional[datetime] = Field(default=None, description="When version was approved")
    
    # Change tracking
    change_notes: Optional[str] = Field(default=None, max_length=1000, description="Notes about changes in this version")
    
    # Relationships
    user_answers: List["UserAnswer"] = Relationship(back_populates="question_version")


class TrainingPlan(BaseTable, table=True):
    """
    Training Plans (Logical)
    Represents logical training plans that can have multiple versions
    """
    __tablename__ = "training_plans"
    
    name: str = Field(max_length=300, description="Training plan name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Training plan description")
    
    # Creator information
    creator_user_id: uuid.UUID = Field(description="User who created this training plan")
    
    # Plan metadata
    category: Optional[str] = Field(default=None, max_length=100, description="Training category")
    tags: Optional[str] = Field(default=None, description="Tags for categorization - JSON string")
    
    # Status
    is_active: bool = Field(default=True, description="Whether plan is active")
    
    # Relationships
    versions: List["TrainingPlanVersion"] = Relationship(back_populates="training_plan")
    assignments: List["PlanAssignment"] = Relationship(back_populates="training_plan")


class TrainingPlanVersion(BaseTable, table=True):
    """
    Training Plan Versions
    Specific versions of training plans with question lists and rules
    """
    __tablename__ = "training_plan_versions"
    
    # Parent plan
    logical_plan_id: uuid.UUID = Field(foreign_key="training_plans.id", description="Parent logical training plan")
    training_plan: TrainingPlan = Relationship(back_populates="versions")
    
    # Version information
    version_number: str = Field(max_length=50, description="Version identifier")
    is_latest_approved: bool = Field(default=False, description="Whether this is the latest approved version")
    
    # Plan content
    question_version_ids: str = Field(
        description="List of question version IDs in this plan - JSON string"
    )
    
    # Plan rules and settings
    deadline_rules: Optional[str] = Field(
        default=None, 
        description="Deadline calculation rules - JSON string"
    )
    
    completion_criteria: Optional[str] = Field(
        default=None, 
        description="Criteria for plan completion - JSON string"
    )
    
    # Plan metadata
    estimated_duration_minutes: Optional[int] = Field(default=None, description="Estimated completion time")
    max_attempts: Optional[int] = Field(default=None, description="Maximum attempts allowed")
    passing_score: Optional[float] = Field(default=None, description="Minimum passing score (0-1)")
    
    # Approval workflow
    status: QuestionStatus = Field(default=QuestionStatus.DRAFT, description="Plan status")
    approved_by: Optional[uuid.UUID] = Field(default=None, description="User who approved this version")
    approved_at: Optional[datetime] = Field(default=None, description="When version was approved")
    
    # Change tracking
    change_notes: Optional[str] = Field(default=None, max_length=1000, description="Notes about changes in this version")
    
    # Relationships
    plan_assignments: List["PlanAssignment"] = Relationship(back_populates="plan_version")


class PlanAssignment(BaseTable, table=True):
    """
    Plan Assignments
    Assigns specific training plan versions to user groups
    """
    __tablename__ = "plan_assignments"
    
    # Plan reference
    logical_plan_id: uuid.UUID = Field(foreign_key="training_plans.id", description="Logical training plan")
    plan_version_id: uuid.UUID = Field(foreign_key="training_plan_versions.id", description="Specific plan version")
    
    # Group assignment
    user_group_id: uuid.UUID = Field(foreign_key="user_groups.id", description="Assigned user group")
    
    # Assignment metadata
    assigned_by: uuid.UUID = Field(description="User who made the assignment")
    assigned_at: datetime = Field(description="When assignment was made")
    
    # Deadline settings
    due_date: Optional[datetime] = Field(default=None, description="Assignment due date")
    auto_start: bool = Field(default=True, description="Whether training auto-starts for users")
    
    # Assignment status
    is_active: bool = Field(default=True, description="Whether assignment is active")
    
    # Notification settings
    send_notifications: bool = Field(default=True, description="Whether to send notifications")
    reminder_settings: Optional[str] = Field(
        default=None, 
        description="Reminder notification settings - JSON string"
    )
    
    # Relationships
    training_plan: TrainingPlan = Relationship(back_populates="assignments")
    plan_version: TrainingPlanVersion = Relationship(back_populates="plan_assignments")
    user_tasks: List["UserTask"] = Relationship(back_populates="plan_assignment")


class TaskStatus(str, Enum):
    """User task status"""
    WAITING = "WAITING"         # Waiting to start
    IN_PROGRESS = "IN_PROGRESS" # Currently working on
    COMPLETED = "COMPLETED"     # Finished
    OVERDUE = "OVERDUE"        # Past deadline
    GENERATING = "GENERATING"   # AI generating content
    CANCELLED = "CANCELLED"     # Cancelled/disabled


class UserTask(BaseTable, table=True):
    """
    User Training Tasks
    Individual training tasks assigned to users
    """
    __tablename__ = "user_tasks"
    
    # User reference
    user_id: uuid.UUID = Field(foreign_key="users.id", description="User assigned this task")
    
    # Assignment reference (optional - for plan-based tasks)
    plan_assignment_id: Optional[uuid.UUID] = Field(
        default=None, 
        foreign_key="plan_assignments.id", 
        description="Plan assignment that created this task"
    )
    
    # Task metadata
    title: str = Field(max_length=500, description="Task title")
    description: Optional[str] = Field(default=None, max_length=1000, description="Task description")
    
    # Task status and timing
    status: TaskStatus = Field(default=TaskStatus.WAITING, description="Current task status")
    assigned_at: datetime = Field(description="When task was assigned")
    started_at: Optional[datetime] = Field(default=None, description="When user started task")
    completed_at: Optional[datetime] = Field(default=None, description="When task was completed")
    due_date: Optional[datetime] = Field(default=None, description="Task deadline")
    
    # Task content (for dynamic/generated tasks)
    question_list: Optional[str] = Field(
        default=None, 
        description="List of question version IDs (for dynamic tasks) - JSON string"
    )
    
    # Progress tracking
    progress_details: Optional[str] = Field(
        default=None, 
        description="Detailed progress information - JSON string"
    )
    
    # Scoring and results
    total_score: Optional[float] = Field(default=None, description="Total score achieved")
    max_possible_score: Optional[float] = Field(default=None, description="Maximum possible score")
    passing_score: Optional[float] = Field(default=None, description="Required passing score")
    
    # Attempt tracking
    attempt_number: int = Field(default=1, description="Current attempt number")
    max_attempts: Optional[int] = Field(default=None, description="Maximum attempts allowed")
    
    # Relationships
    user: "User" = Relationship(back_populates="user_tasks")
    plan_assignment: Optional[PlanAssignment] = Relationship(back_populates="user_tasks")
    user_answers: List["UserAnswer"] = Relationship(back_populates="user_task")


class UserAnswer(BaseTable, table=True):
    """
    User Answers
    Individual answers submitted by users for questions
    """
    __tablename__ = "user_answers"
    
    # References
    user_id: uuid.UUID = Field(foreign_key="users.id", description="User who submitted answer")
    user_task_id: uuid.UUID = Field(foreign_key="user_tasks.id", description="Parent user task")
    question_version_id: uuid.UUID = Field(foreign_key="question_versions.id", description="Specific question version")
    
    # Answer content
    user_answer: Optional[str] = Field(
        default=None, 
        description="User's submitted answer - JSON string"
    )
    
    # Scoring results
    score: Optional[float] = Field(default=None, description="Score awarded")
    max_score: Optional[float] = Field(default=None, description="Maximum possible score")
    is_correct: Optional[bool] = Field(default=None, description="Whether answer is correct")
    
    # AI feedback
    ai_feedback: Optional[str] = Field(default=None, max_length=2000, description="AI-generated feedback")
    ai_score_confidence: Optional[float] = Field(default=None, description="AI confidence in scoring (0-1)")
    
    # Answer metadata
    submitted_at: datetime = Field(description="When answer was submitted")
    time_spent_seconds: Optional[int] = Field(default=None, description="Time spent on question")
    attempt_number: int = Field(default=1, description="Answer attempt number")
    
    # Manual review (if needed)
    requires_manual_review: bool = Field(default=False, description="Whether answer needs human review")
    reviewed_by: Optional[uuid.UUID] = Field(default=None, description="User who manually reviewed")
    reviewed_at: Optional[datetime] = Field(default=None, description="When manual review was done")
    manual_feedback: Optional[str] = Field(default=None, max_length=2000, description="Manual reviewer feedback")
    
    # Relationships
    user: "User" = Relationship(back_populates="user_answers")
    user_task: UserTask = Relationship(back_populates="user_answers")
    question_version: QuestionVersion = Relationship(back_populates="user_answers")


# Import User for forward reference resolution
# from app.models.user import User  # Commented to avoid circular import

# Update forward references
Question.model_rebuild()
QuestionVersion.model_rebuild()
TrainingPlan.model_rebuild()
TrainingPlanVersion.model_rebuild()
PlanAssignment.model_rebuild()
UserTask.model_rebuild()
UserAnswer.model_rebuild()