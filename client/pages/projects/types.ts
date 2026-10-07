/**
 * The shapes the collaboration endpoints answer with, as `server/providers/projects.ts` defines them. The client
 * cannot import server code, so this is the browser-side copy of those view types.
 */

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;
export const MEMBER_ROLES = ['owner', 'member'] as const;
export const MILESTONE_STATUSES = ['open', 'in_progress', 'completed'] as const;
export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'pending_acceptance',
  'completed',
] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export const DELIVERABLE_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly memberCount: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly progress: number;
  readonly myRole: MemberRole;
}

export interface Member {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly name: string | null;
  readonly email: string | null;
  readonly username: string | null;
  readonly createdAt: string;
}

export interface Milestone {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly status: MilestoneStatus;
  readonly position: number;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly canComplete: boolean;
}

export interface Task {
  readonly id: string;
  readonly projectId: string;
  readonly milestoneId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: string | null;
  readonly required: boolean;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliverableCount: number;
  readonly pendingDeliverableCount: number;
  readonly overdue: boolean;
  readonly canUpdate: boolean;
}

export interface Share {
  readonly id: string;
  readonly deliverableId: string;
  readonly sharedWithId: string;
  readonly sharedWithName: string | null;
  readonly sharedWithEmail: string | null;
  readonly sharedById: string;
  readonly sharedByName: string | null;
  readonly createdAt: string;
}

export interface Deliverable {
  readonly id: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: DeliverableStatus;
  readonly rejectReason: string | null;
  readonly reviewerId: string | null;
  readonly reviewerName: string | null;
  readonly reviewedAt: string | null;
  readonly fileId: string | null;
  readonly fileName: string | null;
  readonly fileExt: string | null;
  readonly fileMimeType: string | null;
  readonly fileSize: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canSubmitterShare: boolean;
  readonly canReview: boolean;
  readonly shares: readonly Share[];
}

export interface ProjectDetail {
  readonly project: Project;
  readonly members: readonly Member[];
  readonly milestones: readonly Milestone[];
  readonly tasks: readonly Task[];
  readonly deliverables: readonly Deliverable[];
}

export interface DashboardProject {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly progress: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly overdueTaskCount: number;
  readonly pendingDeliverableCount: number;
  readonly endDate: string | null;
}

export interface Dashboard {
  readonly metrics: {
    readonly projectCount: number;
    readonly openTaskCount: number;
    readonly overdueTaskCount: number;
    readonly pendingAcceptanceCount: number;
  };
  readonly projects: readonly DashboardProject[];
  readonly todos: readonly Task[];
}

export interface Collaborator {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly username: string | null;
}

/** What the projects list passes to its `new` child route so a created project refreshes it. */
export interface ProjectsOutletContext {
  readonly reload: () => void;
}

/** What the project detail passes to the task drawer child route. */
export interface ProjectDetailOutletContext {
  readonly detail: ProjectDetail;
  readonly reload: () => void;
}
