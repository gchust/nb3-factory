import { z } from 'zod';

/**
 * Input and response schemas for the project collaboration API. The response schemas describe what the service
 * actually returns, so the API document is a statement about this application rather than a wish.
 */

export const ProjectStatusSchema = z.enum(['active', 'completed', 'archived']);
export const MemberRoleSchema = z.enum(['owner', 'member']);
export const MilestoneStatusSchema = z.enum([
  'open',
  'in_progress',
  'completed',
]);
export const TaskStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'pending_acceptance',
  'completed',
]);
export const TaskPrioritySchema = z.enum(['low', 'normal', 'high']);
export const DeliverableStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
]);

const OptionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.')
  .nullable()
  .optional();

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatusSchema,
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  memberCount: z.number(),
  taskCount: z.number(),
  completedTaskCount: z.number(),
  progress: z.number(),
  myRole: MemberRoleSchema,
});

export const MemberSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  role: MemberRoleSchema,
  name: z.string().nullable(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  createdAt: z.string(),
});

export const MilestoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: MilestoneStatusSchema,
  position: z.number(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  taskCount: z.number(),
  completedTaskCount: z.number(),
  canComplete: z.boolean(),
});

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  milestoneId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueDate: z.string().nullable(),
  required: z.boolean(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deliverableCount: z.number(),
  pendingDeliverableCount: z.number(),
  overdue: z.boolean(),
  canUpdate: z.boolean(),
});

export const ShareSchema = z.object({
  id: z.string(),
  deliverableId: z.string(),
  sharedWithId: z.string(),
  sharedWithName: z.string().nullable(),
  sharedWithEmail: z.string().nullable(),
  sharedById: z.string(),
  sharedByName: z.string().nullable(),
  createdAt: z.string(),
});

export const DeliverableSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  projectId: z.string(),
  submitterId: z.string(),
  submitterName: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: DeliverableStatusSchema,
  rejectReason: z.string().nullable(),
  reviewerId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  fileId: z.string().nullable(),
  fileName: z.string().nullable(),
  fileExt: z.string().nullable(),
  fileMimeType: z.string().nullable(),
  fileSize: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canSubmitterShare: z.boolean(),
  canReview: z.boolean(),
  shares: z.array(ShareSchema),
});

export const ProjectDetailSchema = z.object({
  project: ProjectSchema,
  members: z.array(MemberSchema),
  milestones: z.array(MilestoneSchema),
  tasks: z.array(TaskSchema),
  deliverables: z.array(DeliverableSchema),
});

export const DashboardSchema = z.object({
  metrics: z.object({
    projectCount: z.number(),
    openTaskCount: z.number(),
    overdueTaskCount: z.number(),
    pendingAcceptanceCount: z.number(),
  }),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: ProjectStatusSchema,
      progress: z.number(),
      taskCount: z.number(),
      completedTaskCount: z.number(),
      overdueTaskCount: z.number(),
      pendingDeliverableCount: z.number(),
      endDate: z.string().nullable(),
    }),
  ),
  todos: z.array(TaskSchema),
});

export const CollaboratorSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  username: z.string().nullable(),
});

export const UploadedFileSchema = z.object({
  id: z.string(),
  disk: z.string(),
  key: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

// --- Params -----------------------------------------------------------------

export const ProjectParams = z.object({ projectId: z.string().min(1) });
export const MilestoneParams = z.object({ milestoneId: z.string().min(1) });
export const TaskParams = z.object({ taskId: z.string().min(1) });
export const DeliverableParams = z.object({
  deliverableId: z.string().min(1),
});
export const MemberParams = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
});
export const ShareParams = z.object({
  deliverableId: z.string().min(1),
  shareId: z.string().min(1),
});

// --- Inputs -----------------------------------------------------------------

export const CreateProjectInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  startDate: OptionalDate,
  endDate: OptionalDate,
});

export const UpdateProjectInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: ProjectStatusSchema.optional(),
    startDate: OptionalDate,
    endDate: OptionalDate,
    ownerId: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const AddMemberInput = z.object({
  userId: z.string().min(1),
  role: MemberRoleSchema.default('member'),
});

export const CreateMilestoneInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  dueDate: OptionalDate,
  position: z.number().int().min(0).optional(),
});

export const UpdateMilestoneInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    dueDate: OptionalDate,
    position: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  milestoneId: z.string().min(1).nullable().optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: OptionalDate,
  required: z.boolean().optional(),
});

export const UpdateTaskInput = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    milestoneId: z.string().min(1).nullable().optional(),
    priority: TaskPrioritySchema.optional(),
    dueDate: OptionalDate,
    required: z.boolean().optional(),
    status: TaskStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const SubmitDeliverableInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  fileId: z.string().min(1).nullable().optional(),
});

export const RejectDeliverableInput = z.object({
  reason: z.string().min(1).max(2000),
});

export const ShareDeliverableInput = z.object({
  userId: z.string().min(1),
});

export const ListProjectsQuery = z.object({
  status: ProjectStatusSchema.optional(),
});

export type ProjectInput = z.infer<typeof CreateProjectInput>;
