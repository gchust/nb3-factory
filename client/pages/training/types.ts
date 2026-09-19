export type CourseStatus = 'draft' | 'published' | 'archived';
export type SessionStatus =
  'planned' | 'in_progress' | 'completed' | 'cancelled';
export type AssignmentStatus = 'draft' | 'published' | 'closed';
export type SubmissionStatus = 'submitted' | 'graded' | 'returned';

export interface TrainingViewer {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly isAdmin: boolean;
  readonly isInstructor: boolean;
  readonly isStudent: boolean;
}

export interface CourseSummary {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string;
  readonly level: string;
  readonly status: CourseStatus;
  readonly sessionCount: number;
  readonly assignmentCount: number;
}

export interface SessionSummary {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly courseId: number;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly capacity: number;
  readonly location: string | null;
  readonly status: SessionStatus;
  readonly enrolledCount: number;
}

export interface LearningSession extends SessionSummary {
  readonly assignmentCount: number;
  readonly submittedCount: number;
  readonly gradedCount: number;
  readonly returnedCount: number;
  readonly nextDueAt: string | null;
}

export interface SubmissionReviewView {
  readonly id: number;
  readonly attempt: number;
  readonly decision: 'graded' | 'returned';
  readonly score: number | null;
  readonly feedback: string;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly createdAt: string;
}

export interface SubmissionView {
  readonly id: number;
  readonly assignmentId: number;
  readonly studentId: string;
  readonly studentName?: string;
  readonly attempt: number;
  readonly content: string;
  readonly status: SubmissionStatus;
  readonly isLate: boolean;
  readonly submittedAt: string;
  readonly score: number | null;
  readonly feedback: string | null;
  readonly maxScore: number;
  readonly reviewedById: string | null;
  readonly reviewedAt: string | null;
  readonly reviews: readonly SubmissionReviewView[];
}

export interface AssignmentView {
  readonly id: number;
  readonly sessionId: number;
  readonly title: string;
  readonly description: string | null;
  readonly dueAt: string;
  readonly maxScore: number;
  readonly status: AssignmentStatus;
  readonly publishedAt: string | null;
  readonly submissionCount: number;
  readonly gradedCount: number;
  readonly pendingCount: number;
  readonly returnedCount: number;
  readonly mySubmission: SubmissionView | null;
}

export interface SessionDetail {
  readonly session: SessionSummary;
  readonly assignments: readonly AssignmentView[];
  readonly roster: readonly {
    readonly studentId: string;
    readonly studentName: string;
  }[];
}

export interface AssignmentDetail {
  readonly assignment: AssignmentView;
  readonly session: SessionSummary;
  readonly submissions: readonly SubmissionView[];
}

export interface GradingTodoItem {
  readonly submissionId: number;
  readonly assignmentId: number;
  readonly assignmentTitle: string;
  readonly sessionId: number;
  readonly sessionTitle: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly attempt: number;
  readonly submittedAt: string;
  readonly isLate: boolean;
}

export interface CompletionStat {
  readonly sessionId: number;
  readonly sessionTitle: string;
  readonly courseTitle: string;
  readonly instructorName: string;
  readonly status: SessionStatus;
  readonly expected: number;
  readonly graded: number;
  readonly pending: number;
  readonly returned: number;
  readonly notSubmitted: number;
  readonly late: number;
  readonly completionRate: number;
  readonly averageScore: number | null;
}

export interface TrainingUserOption {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
}

export const COURSE_STATUS_KEYS: Record<CourseStatus, string> = {
  draft: 'training.courseStatus.draft',
  published: 'training.courseStatus.published',
  archived: 'training.courseStatus.archived',
};

export const SESSION_STATUS_KEYS: Record<SessionStatus, string> = {
  planned: 'training.sessionStatus.planned',
  in_progress: 'training.sessionStatus.inProgress',
  completed: 'training.sessionStatus.completed',
  cancelled: 'training.sessionStatus.cancelled',
};

export const ASSIGNMENT_STATUS_KEYS: Record<AssignmentStatus, string> = {
  draft: 'training.assignmentStatus.draft',
  published: 'training.assignmentStatus.published',
  closed: 'training.assignmentStatus.closed',
};

export const SUBMISSION_STATUS_KEYS: Record<SubmissionStatus, string> = {
  submitted: 'training.submissionStatus.submitted',
  graded: 'training.submissionStatus.graded',
  returned: 'training.submissionStatus.returned',
};

export const COURSE_STATUSES: readonly CourseStatus[] = [
  'draft',
  'published',
  'archived',
];
export const SESSION_STATUSES: readonly SessionStatus[] = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
];
export const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'draft',
  'published',
  'closed',
];

export function formatDateTime(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function toDateTimeLocal(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 86400000);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
