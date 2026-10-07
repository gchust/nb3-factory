import { z } from 'zod';

/** An RFC 3339 timestamp, documented by its format alone. */
const dateTime = () => z.string().meta({ format: 'date-time' });
const documentCategory = z.enum(['handbook', 'policy', 'template']);
const documentStatus = z.enum(['draft', 'published']);
const documentVisibility = z.enum(['all', 'departments']);

export const DOCUMENT_CATEGORIES = ['handbook', 'policy', 'template'] as const;
export const DOCUMENT_STATUSES = ['draft', 'published'] as const;
export const DOCUMENT_VISIBILITIES = ['all', 'departments'] as const;

/** Request inputs. Fixed segments are declared before `/:param` in the routers. */

export const ListDocumentsQuery = z.object({
  q: z.string().max(200).optional(),
  category: documentCategory.optional(),
  deleted: z.enum(['exclude', 'include', 'only']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const AskInput = z.strictObject({
  question: z.string().trim().min(1).max(500),
});

export const DocumentParams = z.object({
  documentId: z.coerce.number().int().positive(),
});

export const DocumentVersionParams = z.object({
  documentId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
});

export const CreateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(64).nullable().optional(),
  category: documentCategory,
  summary: z.string().max(2000).nullable().optional(),
  content: z.string().trim().min(1),
  status: documentStatus.optional(),
  visibility: documentVisibility,
  departmentIds: z.array(z.number().int().positive()).optional(),
  changeNote: z.string().max(255).nullable().optional(),
});

export const UpdateDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(64).nullable().optional(),
  category: documentCategory.optional(),
  summary: z.string().max(2000).nullable().optional(),
  content: z.string().trim().min(1).optional(),
  status: documentStatus.optional(),
  visibility: documentVisibility.optional(),
  departmentIds: z.array(z.number().int().positive()).optional(),
  changeNote: z.string().max(255).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export const RestoreVersionInput = z.strictObject({
  changeNote: z.string().max(255).nullable().optional(),
});

export const DepartmentParams = z.object({
  departmentId: z.coerce.number().int().positive(),
});

export const CreateDepartmentInput = z.strictObject({
  code: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(128),
  description: z.string().max(512).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const UpdateDepartmentInput = z.strictObject({
  title: z.string().trim().min(1).max(128).optional(),
  description: z.string().max(512).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const MemberParams = z.object({
  memberId: z.coerce.number().int().positive(),
});

export const CreateMemberInput = z.strictObject({
  departmentId: z.number().int().positive(),
  userId: z.string().trim().min(1).max(191),
  primary: z.boolean().optional(),
});

export const DirectoryUsersQuery = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const BackupParams = z.object({
  backupId: z.coerce.number().int().positive(),
});

export const CreateBackupInput = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
});

export const RestoreBackupInput = z.strictObject({
  confirm: z.literal(true, {
    error: 'Confirm the restore with confirm=true.',
  }),
});

/** Response schemas. They describe what the routes send; nothing validates a response against them. */

export const DocumentSummarySchema = z
  .object({
    id: z.number().int(),
    code: z.string().nullable(),
    title: z.string(),
    category: z.enum(DOCUMENT_CATEGORIES),
    summary: z.string().nullable(),
    status: z.enum(DOCUMENT_STATUSES),
    visibility: z.enum(DOCUMENT_VISIBILITIES),
    version: z.number().int(),
    deletedAt: dateTime().nullable(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    departmentIds: z.array(z.number().int()),
  })
  .meta({ ref: 'DocumentCenterDocument' });

export const DocumentDetailSchema = z
  .object({
    id: z.number().int(),
    code: z.string().nullable(),
    title: z.string(),
    category: z.enum(DOCUMENT_CATEGORIES),
    summary: z.string().nullable(),
    content: z.string(),
    status: z.enum(DOCUMENT_STATUSES),
    visibility: z.enum(DOCUMENT_VISIBILITIES),
    version: z.number().int(),
    deletedAt: dateTime().nullable(),
    deletedById: z.string().nullable(),
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
    departmentIds: z.array(z.number().int()),
  })
  .meta({ ref: 'DocumentCenterDocumentDetail' });

export const DocumentPageMetaSchema = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .meta({ ref: 'DocumentCenterPageMeta' });

export const DocumentVersionSchema = z
  .object({
    id: z.number().int(),
    documentId: z.number().int(),
    version: z.number().int(),
    title: z.string(),
    category: z.enum(DOCUMENT_CATEGORIES),
    summary: z.string().nullable(),
    content: z.string(),
    visibility: z.enum(DOCUMENT_VISIBILITIES),
    departmentIds: z.array(z.number().int()),
    changeNote: z.string().nullable(),
    createdById: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'DocumentCenterDocumentVersion' });

export const CitationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  version: z.number().int(),
  heading: z.string().nullable(),
  snippet: z.string(),
  score: z.number().int(),
});

export const AnswerSchema = z
  .object({
    hasAnswer: z.boolean().meta({
      description:
        'False when no accessible document supports an answer; `citations` is then empty.',
    }),
    citations: z.array(CitationSchema).meta({
      description:
        'Only documents the asker may read. A question with no basis returns an empty list.',
    }),
  })
  .meta({ ref: 'DocumentCenterAnswer' });

export const DepartmentSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: dateTime(),
    updatedAt: dateTime(),
  })
  .meta({ ref: 'DocumentCenterDepartment' });

export const DepartmentMemberSchema = z
  .object({
    id: z.number().int(),
    departmentId: z.number().int(),
    userId: z.string(),
    primary: z.boolean(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'DocumentCenterDepartmentMember' });

export const DirectoryUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    username: z.string().nullable(),
    email: z.string().nullable(),
  })
  .meta({ ref: 'DocumentCenterDirectoryUser' });

export const BackupSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    documentCount: z.number().int(),
    versionCount: z.number().int(),
    createdById: z.string().nullable(),
    createdAt: dateTime(),
  })
  .meta({ ref: 'DocumentCenterBackup' });

export const BackupImpactSchema = z
  .object({
    backup: BackupSchema,
    summary: z.object({
      create: z.number().int(),
      update: z.number().int(),
      restore: z.number().int(),
      delete: z.number().int(),
      unchanged: z.number().int(),
      total: z.number().int(),
    }),
    documents: z.array(
      z.object({
        documentId: z.number().int().nullable(),
        title: z.string(),
        code: z.string().nullable(),
        action: z.enum(['create', 'update', 'restore', 'delete', 'unchanged']),
      }),
    ),
  })
  .meta({ ref: 'DocumentCenterBackupImpact' });

export const BackupRestoreResultSchema = z
  .object({
    backupId: z.number().int(),
    documents: z.number().int(),
  })
  .meta({ ref: 'DocumentCenterBackupRestore' });
