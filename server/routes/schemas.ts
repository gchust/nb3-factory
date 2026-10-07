import { z } from 'zod';

import {
  EXPENSE_ACTIONS,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  EXPORT_JOB_STATUSES,
  MAX_CLAIM_PAGE_SIZE,
  MAX_INVOICE_SIZE,
} from '../expense/model.js';

/**
 * The wire contract of the expense endpoints.
 *
 * These zod schemas do two jobs: they validate every request body and query in the route (through `apiValidator()`) and
 * they describe the requests and responses in the API document. They exist here, next to the routes, because they are
 * deliberately a separate statement from the domain types: a domain type may gain a field without the API changing, and
 * a wire field may change shape without the database moving.
 */

export const ExpenseStatusSchema = z.enum(EXPENSE_STATUSES);
export const ExpenseActionSchema = z.enum(EXPENSE_ACTIONS);
export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const ExpensePaymentMethodSchema = z.enum(EXPENSE_PAYMENT_METHODS);
export const ExportJobStatusSchema = z.enum(EXPORT_JOB_STATUSES);

/** A query parameter that may appear once or several times, or as a comma-separated list. */
const listQueryValue = z.union([z.string(), z.array(z.string())]);

export const ExpenseItemInputSchema = z.object({
  category: ExpenseCategorySchema,
  amount: z.number().positive().max(10_000_000),
  /** An ISO calendar day, `YYYY-MM-DD`. */
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')
    .nullish(),
  description: z.string().max(500).nullish(),
  invoiceId: z.string().max(255).nullish(),
  invoiceName: z.string().max(255).nullish(),
  invoiceExt: z.string().max(32).nullish(),
  invoiceType: z.string().max(128).nullish(),
});

export const ClaimInputSchema = z.object({
  title: z.string().min(1).max(255),
  departmentId: z.string().max(64).nullish(),
  remark: z.string().max(2000).nullish(),
  items: z.array(ExpenseItemInputSchema).min(1).max(100),
});

export const ClaimParamsSchema = z.object({
  claimId: z.string().min(1).max(64),
});

export const ExportParamsSchema = z.object({
  exportId: z.string().min(1).max(64),
});

export const ClaimDecisionInputSchema = z.object({
  comment: z.string().max(2000).nullish(),
});

export const ClaimPayInputSchema = z.object({
  paymentMethod: ExpensePaymentMethodSchema,
  paymentRemark: z.string().max(255).nullish(),
});

/** The filters the list, the statistics and the export share. */
export const ClaimFilterQuerySchema = z.object({
  /** One or more statuses, comma separated or repeated. */
  status: listQueryValue.optional(),
  departmentId: listQueryValue.optional(),
  keyword: z.string().max(200).optional(),
  submittedFrom: z.string().max(40).optional(),
  submittedTo: z.string().max(40).optional(),
});

export const ClaimListQuerySchema = ClaimFilterQuerySchema.extend({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_CLAIM_PAGE_SIZE).optional(),
  sort: z.enum(['createdAt', 'submittedAt', 'totalAmount']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const ExportFilterInputSchema = ClaimFilterQuerySchema;

export const DepartmentSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  managerId: z.string().nullable(),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});

export const ClaimRecordSchema = z.object({
  id: z.string(),
  claimNo: z.string(),
  title: z.string(),
  applicantId: z.string(),
  applicantName: z.string(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  status: ExpenseStatusSchema,
  totalAmount: z.number(),
  remark: z.string().nullable(),
  submittedAt: z.date().nullable(),
  decidedAt: z.date().nullable(),
  paidAt: z.date().nullable(),
  paymentMethod: z.string().nullable(),
  paymentRemark: z.string().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
});

export const ExpenseItemSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  category: z.string(),
  amount: z.number(),
  expenseDate: z.union([z.string(), z.date()]).nullable(),
  description: z.string().nullable(),
  invoiceId: z.string().nullable(),
  invoiceName: z.string().nullable(),
  invoiceExt: z.string().nullable(),
  invoiceType: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const ApprovalSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  action: ExpenseActionSchema,
  operatorId: z.string(),
  operatorName: z.string(),
  fromStatus: ExpenseStatusSchema,
  toStatus: ExpenseStatusSchema,
  comment: z.string().nullable(),
  createdAt: z.date().nullable(),
});

export const ClaimCapabilitiesSchema = z.object({
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canSubmit: z.boolean(),
  canApprove: z.boolean(),
  canReject: z.boolean(),
  canPay: z.boolean(),
});

export const ClaimListRowSchema = ClaimRecordSchema.extend({
  capabilities: ClaimCapabilitiesSchema,
  itemCount: z.number().int(),
});

export const ClaimDetailSchema = z.object({
  claim: ClaimRecordSchema,
  items: z.array(ExpenseItemSchema),
  approvals: z.array(ApprovalSchema),
  capabilities: ClaimCapabilitiesSchema,
});

export const ExpenseStatsBucketSchema = z.object({
  count: z.number().int(),
  totalAmount: z.number(),
  paidAmount: z.number(),
});

export const ExpenseStatsSchema = z.object({
  totals: ExpenseStatsBucketSchema.extend({
    pendingAmount: z.number(),
    rejectedCount: z.number().int(),
  }),
  byMonth: z.array(ExpenseStatsBucketSchema.extend({ month: z.string() })),
  byDepartment: z.array(
    ExpenseStatsBucketSchema.extend({
      departmentId: z.string().nullable(),
      departmentName: z.string(),
    }),
  ),
  byStatus: z.array(
    ExpenseStatsBucketSchema.extend({ status: ExpenseStatusSchema }),
  ),
});

export const ExportJobSchema = z.object({
  id: z.string(),
  status: ExportJobStatusSchema,
  total: z.number().int(),
  processed: z.number().int(),
  progress: z.number(),
  resultFilename: z.string().nullable(),
  resultSize: z.number().int(),
  error: z.string().nullable(),
  filter: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date().nullable(),
});

export const ExportContentSchema = z.object({
  filename: z.string(),
  content: z.string(),
});

export const ExpenseListMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

/** A bounded configuration list still reports its size. */
export const ExpenseCountMetaSchema = z.object({
  total: z.number().int(),
});

/** The upload limit, re-exported so the client-facing copy and the route agree on one number. */
export const expenseInvoiceMaxSize = MAX_INVOICE_SIZE;
