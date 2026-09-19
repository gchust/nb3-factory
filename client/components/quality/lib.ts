import { ApiClientError, type ApiClient } from '@nocobase/app-client';

export type TaskStatus = 'pending' | 'in_progress' | 'submitted';
export type TaskResult = 'qualified' | 'unqualified';
export type ItemResult = 'pending' | 'qualified' | 'unqualified';
export type NonconformanceStatus =
  'open' | 'processing' | 'pending_review' | 'closed' | 'returned';

export interface QualitySession {
  readonly user: { readonly id: string; readonly name: string };
  readonly roles: readonly string[];
  readonly capabilities: {
    readonly supervise: boolean;
    readonly inspect: boolean;
    readonly produce: boolean;
  };
}

export interface QualityProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly specification: string | null;
  readonly unit: string;
  readonly status: string;
}

export interface QualityBatch {
  readonly id: string;
  readonly batchNo: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly quantity: number;
  readonly productionLine: string | null;
  readonly producedAt: string;
  readonly status: string;
  readonly remark: string | null;
}

export interface QualityItem {
  readonly id: string;
  readonly seq: number;
  readonly name: string;
  readonly method: string | null;
  readonly standard: string | null;
  readonly unit: string | null;
  readonly result: ItemResult;
  readonly measuredValue: string | null;
  readonly remark: string | null;
}

export interface QualityTask {
  readonly id: string;
  readonly taskNo: string;
  readonly batchId: string;
  readonly batchNo: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly inspectorId: string;
  readonly inspectorName: string;
  readonly assignedLeadId: string | null;
  readonly assignedLeadName: string | null;
  readonly sampleSize: number;
  readonly status: TaskStatus;
  readonly result: TaskResult | null;
  readonly remark: string | null;
  readonly submittedAt: string | null;
  readonly createdAt: string;
  readonly itemCount: number;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
}

export interface QualityTaskDetail extends QualityTask {
  readonly items: readonly QualityItem[];
  readonly nonconformances: readonly QualityNonconformance[];
}

export interface QualityNonconformance {
  readonly id: string;
  readonly code: string;
  readonly taskId: string;
  readonly taskNo: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly batchId: string;
  readonly batchNo: string;
  readonly productName: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: NonconformanceStatus;
  readonly assignedToId: string;
  readonly assignedToName: string;
  readonly reason: string | null;
  readonly measure: string | null;
  readonly handledAt: string | null;
  readonly reviewedById: string | null;
  readonly reviewedByName: string | null;
  readonly reviewedAt: string | null;
  readonly reviewComment: string | null;
  readonly createdAt: string;
}

export interface PassRateSummary {
  readonly total: number;
  readonly qualified: number;
  readonly unqualified: number;
  readonly passRate: number;
  readonly groups: readonly {
    readonly productId: string;
    readonly productCode: string;
    readonly productName: string;
    readonly total: number;
    readonly qualified: number;
    readonly unqualified: number;
    readonly passRate: number;
  }[];
}

export interface AssignableUsers {
  readonly inspectors: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly productionLeads: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

interface Envelope<T> {
  readonly data: T;
}

function cleanQuery(
  query: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function loadSession(api: ApiClient): Promise<QualitySession> {
  return api
    .request<Envelope<QualitySession>>({ path: 'quality/session' })
    .then((response) => response.data);
}

export function loadProducts(
  api: ApiClient,
): Promise<readonly QualityProduct[]> {
  return api
    .request<Envelope<readonly QualityProduct[]>>({ path: 'quality/products' })
    .then((response) => response.data);
}

export function createProduct(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<QualityProduct> {
  return api
    .request<Envelope<QualityProduct>>({
      path: 'quality/products',
      method: 'POST',
      json: input,
    })
    .then((response) => response.data);
}

export function loadBatches(
  api: ApiClient,
  filter: { search?: string; productId?: string; status?: string } = {},
): Promise<readonly QualityBatch[]> {
  return api
    .request<Envelope<readonly QualityBatch[]>>({
      path: 'quality/batches',
      query: cleanQuery(filter),
    })
    .then((response) => response.data);
}

export function createBatch(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<QualityBatch> {
  return api
    .request<Envelope<QualityBatch>>({
      path: 'quality/batches',
      method: 'POST',
      json: input,
    })
    .then((response) => response.data);
}

export function loadTasks(
  api: ApiClient,
  filter: {
    search?: string;
    status?: string;
    result?: string;
    productId?: string;
    submittedOnly?: boolean;
  } = {},
): Promise<readonly QualityTask[]> {
  return api
    .request<Envelope<readonly QualityTask[]>>({
      path: 'quality/tasks',
      query: cleanQuery({
        search: filter.search,
        status: filter.status,
        result: filter.result,
        productId: filter.productId,
        submittedOnly: filter.submittedOnly ? 'true' : undefined,
      }),
    })
    .then((response) => response.data);
}

export function loadTask(
  api: ApiClient,
  taskId: string,
): Promise<QualityTaskDetail> {
  return api
    .request<Envelope<QualityTaskDetail>>({
      path: `quality/tasks/${encodeURIComponent(taskId)}`,
    })
    .then((response) => response.data);
}

export function createTask(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<QualityTaskDetail> {
  return api
    .request<Envelope<QualityTaskDetail>>({
      path: 'quality/tasks',
      method: 'POST',
      json: input,
    })
    .then((response) => response.data);
}

export function recordItem(
  api: ApiClient,
  taskId: string,
  itemId: string,
  input: Record<string, unknown>,
): Promise<QualityTaskDetail> {
  return api
    .request<Envelope<QualityTaskDetail>>({
      path: `quality/tasks/${encodeURIComponent(taskId)}/items/${encodeURIComponent(itemId)}`,
      method: 'PATCH',
      json: input,
    })
    .then((response) => response.data);
}

export function submitTask(
  api: ApiClient,
  taskId: string,
): Promise<QualityTaskDetail> {
  return api
    .request<Envelope<QualityTaskDetail>>({
      path: `quality/tasks/${encodeURIComponent(taskId)}/submit`,
      method: 'POST',
    })
    .then((response) => response.data);
}

export function loadNonconformances(
  api: ApiClient,
  filter: { search?: string; status?: string } = {},
): Promise<readonly QualityNonconformance[]> {
  return api
    .request<Envelope<readonly QualityNonconformance[]>>({
      path: 'quality/nonconformances',
      query: cleanQuery(filter),
    })
    .then((response) => response.data);
}

export function loadNonconformance(
  api: ApiClient,
  id: string,
): Promise<QualityNonconformance> {
  return api
    .request<Envelope<QualityNonconformance>>({
      path: `quality/nonconformances/${encodeURIComponent(id)}`,
    })
    .then((response) => response.data);
}

export function updateNonconformance(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<QualityNonconformance> {
  return api
    .request<Envelope<QualityNonconformance>>({
      path: `quality/nonconformances/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: input,
    })
    .then((response) => response.data);
}

export function reviewNonconformance(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<QualityNonconformance> {
  return api
    .request<Envelope<QualityNonconformance>>({
      path: `quality/nonconformances/${encodeURIComponent(id)}/review`,
      method: 'POST',
      json: input,
    })
    .then((response) => response.data);
}

export function loadPassRate(api: ApiClient): Promise<PassRateSummary> {
  return api
    .request<Envelope<PassRateSummary>>({ path: 'quality/stats/pass-rate' })
    .then((response) => response.data);
}

export function loadAssignableUsers(api: ApiClient): Promise<AssignableUsers> {
  return api
    .request<Envelope<AssignableUsers>>({ path: 'quality/assignable-users' })
    .then((response) => response.data);
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'quality.taskStatus.pending',
  in_progress: 'quality.taskStatus.inProgress',
  submitted: 'quality.taskStatus.submitted',
};

export const TASK_RESULT_LABEL: Record<TaskResult, string> = {
  qualified: 'quality.result.qualified',
  unqualified: 'quality.result.unqualified',
};

export const ITEM_RESULT_LABEL: Record<ItemResult, string> = {
  pending: 'quality.itemResult.pending',
  qualified: 'quality.itemResult.qualified',
  unqualified: 'quality.itemResult.unqualified',
};

export const NONCONFORMANCE_STATUS_LABEL: Record<NonconformanceStatus, string> =
  {
    open: 'quality.ncStatus.open',
    processing: 'quality.ncStatus.processing',
    pending_review: 'quality.ncStatus.pendingReview',
    closed: 'quality.ncStatus.closed',
    returned: 'quality.ncStatus.returned',
  };

export const BATCH_STATUS_LABEL: Record<string, string> = {
  completed: 'quality.batchStatus.completed',
  in_production: 'quality.batchStatus.inProduction',
  hold: 'quality.batchStatus.hold',
};

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  pending: 'neutral',
  in_progress: 'info',
  submitted: 'success',
};

export const NONCONFORMANCE_STATUS_TONE: Record<NonconformanceStatus, Tone> = {
  open: 'danger',
  processing: 'warning',
  pending_review: 'info',
  closed: 'success',
  returned: 'warning',
};

export const ITEM_RESULT_TONE: Record<ItemResult, Tone> = {
  pending: 'neutral',
  qualified: 'success',
  unqualified: 'danger',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export const tableClasses = {
  wrap: 'overflow-x-auto rounded-xl border border-border bg-card',
  table: 'w-full min-w-[48rem] border-collapse text-sm',
  headRow: 'border-b border-border bg-muted/50 text-left',
  headCell:
    'px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground',
  row: 'border-b border-border/60 last:border-b-0',
  cell: 'px-3 py-2 align-middle',
  cellMuted: 'px-3 py-2 align-middle text-muted-foreground',
} as const;

export const formClasses = {
  field: 'space-y-1.5',
  label: 'text-sm font-medium',
  actions: 'flex flex-wrap justify-end gap-2 border-t pt-4',
  textarea:
    'w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
} as const;

/**
 * Lets a mutation performed inside a route overlay refresh the list page it
 * covers, which stays mounted underneath while the dialog is open.
 */
const qualityDataListeners = new Set<() => void>();

export function notifyQualityDataChanged(): void {
  for (const listener of qualityDataListeners) listener();
}

export function subscribeQualityData(listener: () => void): () => void {
  qualityDataListeners.add(listener);
  return () => {
    qualityDataListeners.delete(listener);
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload as
      { code?: unknown; message?: unknown } | undefined;
    if (typeof payload?.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
    if (typeof payload?.code === 'string' && payload.code.length > 0) {
      return payload.code;
    }
    return `HTTP ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * A validation result names the field it belongs to and the translation key
 * that states the problem. Components render the keyed message next to the
 * field, so validation feedback is localized and visible without a round trip
 * to the server.
 */
export interface QualityFieldError {
  readonly field: string;
  readonly key: string;
}

/** Field id for a check-item row, keyed by the draft's stable React key. */
export function itemFieldErrorKey(itemKey: string): string {
  return `item:${itemKey}`;
}

/**
 * Turns a validation result into the per-field message map a form renders.
 * A translate function is passed in because the helpers stay free of hooks.
 */
export function fieldErrorMessages(
  errors: readonly QualityFieldError[],
  translate: (key: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    errors.map((entry) => [entry.field, translate(entry.key)]),
  );
}

/**
 * Removes one field's message, returning the same object when that field had
 * no error so React can skip the re-render. Used to clear a field's message as
 * soon as the user edits it.
 */
export function withoutFieldError(
  current: Record<string, string>,
  field: string,
): Record<string, string> {
  if (!(field in current)) return current;
  const next = { ...current };
  delete next[field];
  return next;
}

export function validateTaskDraft(input: {
  readonly batchId: string;
  readonly inspectorId: string;
  readonly assignedLeadId: string;
  readonly sampleSize: string;
  readonly items: readonly {
    readonly key: string;
    readonly name: string;
  }[];
}): readonly QualityFieldError[] {
  const errors: QualityFieldError[] = [];
  if (!input.batchId) {
    errors.push({ field: 'batchId', key: 'quality.validation.batchRequired' });
  }
  if (!input.inspectorId) {
    errors.push({
      field: 'inspectorId',
      key: 'quality.validation.inspectorRequired',
    });
  }
  if (!input.assignedLeadId) {
    errors.push({
      field: 'assignedLeadId',
      key: 'quality.validation.leadRequired',
    });
  }
  const sampleSize = Number(input.sampleSize);
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    errors.push({
      field: 'sampleSize',
      key: 'quality.validation.sampleSizePositive',
    });
  }
  if (input.items.length === 0) {
    errors.push({ field: 'items', key: 'quality.validation.itemsRequired' });
  }
  for (const item of input.items) {
    if (item.name.trim().length === 0) {
      errors.push({
        field: itemFieldErrorKey(item.key),
        key: 'quality.validation.itemNameRequired',
      });
    }
  }
  return errors;
}

export function validateProductDraft(input: {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
}): readonly QualityFieldError[] {
  const errors: QualityFieldError[] = [];
  if (!input.code.trim()) {
    errors.push({
      field: 'code',
      key: 'quality.validation.productCodeRequired',
    });
  }
  if (!input.name.trim()) {
    errors.push({
      field: 'name',
      key: 'quality.validation.productNameRequired',
    });
  }
  if (!input.unit.trim()) {
    errors.push({ field: 'unit', key: 'quality.validation.unitRequired' });
  }
  return errors;
}

export function validateBatchDraft(input: {
  readonly productId: string;
  readonly batchNo: string;
  readonly quantity: string;
  readonly producedAt: string;
}): readonly QualityFieldError[] {
  const errors: QualityFieldError[] = [];
  if (!input.productId) {
    errors.push({
      field: 'productId',
      key: 'quality.validation.productRequired',
    });
  }
  if (!input.batchNo.trim()) {
    errors.push({
      field: 'batchNo',
      key: 'quality.validation.batchNoRequired',
    });
  }
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.push({
      field: 'quantity',
      key: 'quality.validation.quantityPositive',
    });
  }
  if (!input.producedAt) {
    errors.push({
      field: 'producedAt',
      key: 'quality.validation.producedAtRequired',
    });
  }
  return errors;
}

export function validateHandlingDraft(input: {
  readonly reason: string;
  readonly measure: string;
}): readonly QualityFieldError[] {
  const errors: QualityFieldError[] = [];
  if (!input.reason.trim()) {
    errors.push({ field: 'reason', key: 'quality.validation.reasonRequired' });
  }
  if (!input.measure.trim()) {
    errors.push({
      field: 'measure',
      key: 'quality.validation.measureRequired',
    });
  }
  return errors;
}

export function validateReviewDraft(
  decision: 'close' | 'return',
  comment: string,
): readonly QualityFieldError[] {
  if (decision === 'return' && !comment.trim()) {
    return [
      { field: 'comment', key: 'quality.validation.returnCommentRequired' },
    ];
  }
  return [];
}

export function validateItemDraft(input: {
  readonly result: string;
  readonly remark: string;
}): readonly QualityFieldError[] {
  if (!input.result) {
    return [{ field: 'result', key: 'quality.validation.itemResultRequired' }];
  }
  if (input.result === 'unqualified' && !input.remark.trim()) {
    return [
      {
        field: 'remark',
        key: 'quality.validation.unqualifiedRemarkRequired',
      },
    ];
  }
  return [];
}

/**
 * Maps a rejected quality request to the localized wording of its business
 * code. The server's own text is intentionally not shown: those messages are
 * English, and the acceptance criteria require the interface to lead in
 * Chinese. Codes come from `QualityError`; an unrecognized failure falls back
 * to the raw message so nothing is swallowed silently.
 */
const QUALITY_ERROR_KEYS: Readonly<Record<string, string>> = {
  UNAUTHORIZED: 'quality.error.unauthorized',
  FORBIDDEN: 'quality.error.forbidden',
  NOT_FOUND: 'quality.error.notFound',
  CONFLICT: 'quality.error.conflict',
  INVALID_STATUS: 'quality.error.invalidStatus',
  INCOMPLETE_ITEMS: 'quality.error.incompleteItems',
  VALIDATION: 'quality.error.validation',
};

const QUALITY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  'Returning a nonconformance requires a comment.':
    'quality.validation.returnCommentRequired',
  'An unqualified item requires a remark describing the deviation.':
    'quality.validation.unqualifiedRemarkRequired',
  'Every check item must be recorded before submission.':
    'quality.error.incompleteItems',
  'Product code already exists.': 'quality.error.productCodeExists',
  'Batch number already exists.': 'quality.error.batchNoExists',
};

/** Translation key for a failed quality request, or `undefined` if unknown. */
export function qualityErrorKey(error: unknown): string | undefined {
  if (error instanceof ApiClientError) {
    const message = errorMessage(error);
    if (QUALITY_MESSAGE_KEYS[message]) return QUALITY_MESSAGE_KEYS[message];
    const code =
      error.code ?? (error.payload as { code?: unknown } | undefined)?.code;
    if (typeof code === 'string' && QUALITY_ERROR_KEYS[code]) {
      return QUALITY_ERROR_KEYS[code];
    }
  }
  return undefined;
}

/**
 * Localizes a failed quality request, falling back to the raw message so a
 * failure the client does not recognize is still shown rather than swallowed.
 */
export function qualityErrorText(
  error: unknown,
  translate: (key: string) => string,
): string {
  const key = qualityErrorKey(error);
  return key ? translate(key) : errorMessage(error);
}
