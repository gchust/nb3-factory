/**
 * Narrow ports the after-sales domain depends on.
 *
 * The domain talks to the notification and logging services through these
 * shapes instead of the plugin packages' full contracts: the Workflow `run`
 * modules and the provider both satisfy them, and keeping them small makes the
 * domain's requirements explicit.
 */

export interface ServiceLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface InAppMessageInput {
  readonly to: string | readonly [string, ...string[]];
  readonly title: string;
  readonly body: string;
  readonly target?:
    | { readonly type: 'route'; readonly path: string }
    | { readonly type: 'url'; readonly url: string };
}

export interface NotificationSendInput {
  readonly idempotencyKey: string;
  readonly source?: { readonly type: string; readonly referenceId?: string };
  readonly messages: { readonly inbox: InAppMessageInput };
}

export interface NotificationSendResult {
  readonly notificationId: string;
  readonly idempotencyKey: string;
  readonly deduplicated: boolean;
  readonly status: string;
}

export interface NotificationStatusSnapshot {
  readonly notificationId: string;
  readonly status: string;
  readonly terminal: boolean;
}

/** The subset of the notification service this application sends through. */
export interface NotificationPort {
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
  getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationStatusSnapshot | undefined>;
}

/** A trigger receipt as returned by the Workflow service. */
export interface WorkflowTriggerReceiptLike {
  readonly status: 'accepted' | 'skipped';
  readonly eventKey?: string;
  readonly runId?: string | number;
  readonly reason?: string;
}

/** The subset of the Workflow service this application triggers. */
export interface WorkflowPort {
  trigger(
    workflowKey: string,
    input: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<WorkflowTriggerReceiptLike>;
}

/** The state of one document submitted to the knowledge base. */
export interface KnowledgeIndexState {
  readonly referenceId: string;
  readonly status: 'pending' | 'indexed' | 'failed';
  readonly message?: string | null;
}

/** The scheduled jobs this application registers with the Scheduler. */
export type ScheduledJob = 'daily-inspections' | 'overdue-reminders';

/**
 * The plan key each job is registered under.
 *
 * The domain chooses the key and the provider materializes it, so this is the
 * one place both read: a rename cannot leave the target registered under a name
 * the runner no longer asks for.
 */
export const SCHEDULE_KEYS: Record<ScheduledJob, string> = {
  'daily-inspections': 'service.daily-inspections',
  'overdue-reminders': 'service.overdue-reminders',
};

/** A schedule's state as the Scheduler records it, plus "not finished yet". */
export type ScheduleRunStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered'
  | 'dispatched';

/** One registered plan, as the Scheduler holds it. */
export interface SchedulePlan {
  readonly job: ScheduledJob;
  readonly scheduleId: string;
  readonly title: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly lifecycleState: 'active' | 'inactive';
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
}

/** One execution of a plan, as the Scheduler recorded it. */
export interface ScheduleOccurrence {
  readonly id: string;
  readonly status: ScheduleRunStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly result?: Record<string, unknown>;
}

/**
 * The outcome of asking one of the application's schedules to run now.
 *
 * This is a receipt for that one run, not a copy of the plan. `enabled` is the
 * plan's own switch at the moment it ran; a switched-off plan is refused rather
 * than executed, so the receipt reports `skipped` with `result` empty and the
 * caller says so instead of implying the run happened. `status` is what the
 * Scheduler recorded for the occurrence the run produced; `dispatched` means it
 * had not reached a terminal state before the request returned, so the caller
 * must not report completion.
 */
export interface ScheduleRunResult {
  readonly job: ScheduledJob;
  readonly scheduleId: string;
  readonly title: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly status: ScheduleRunStatus;
  readonly reason?: string;
  readonly result?: Record<string, unknown>;
}

/**
 * The subset of the Scheduler this application uses.
 *
 * It reads the plans and their executions as the Scheduler holds them, and runs
 * a plan on demand through that same registration: the same target executes
 * under the same definition and the run lands in the Scheduler's own execution
 * records, so a manual run and a scheduled one are the same event in the same
 * table. `run` answers `null` when no plan is registered for the job, which
 * lets the caller run the operation directly when the Scheduler is absent.
 */
export interface SchedulerPort {
  list(): Promise<readonly SchedulePlan[]>;
  occurrences(scheduleId: string): Promise<readonly ScheduleOccurrence[]>;
  run(job: ScheduledJob): Promise<ScheduleRunResult | null>;
}

/**
 * The subset of the AI Knowledge Base the manual library uses.
 *
 * It is optional on purpose: an installation without a configured model or
 * embedding service can still create, read and maintain manuals, and the real
 * readiness is displayed instead of pretending the document was indexed.
 */
export interface KnowledgeIndexPort {
  submit(input: {
    readonly referenceId: string;
    readonly title: string;
    readonly equipmentModel?: string | null;
    readonly summary?: string | null;
    readonly fileId?: string | null;
  }): Promise<KnowledgeIndexState>;
  status(referenceId: string): Promise<KnowledgeIndexState>;
  remove(referenceId: string): Promise<void>;
}

/** One issued API key, without its secret (which is shown once at creation). */
export interface ApiKeySummary {
  readonly id: string;
  readonly name: string | null;
  readonly prefix: string | null;
  readonly start: string | null;
  readonly enabled: boolean;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
  readonly lastRequest: string | null;
}

/**
 * The subset of the API Keys plugin this application manages.
 *
 * Keys are created for the integration account from trusted server code, so the
 * supervisor never signs in as that account and never issues a key in their own
 * name. The port is optional: an installation without the plugin can still use
 * every other part of the domain.
 */
export interface ApiKeyPort {
  readonly configId: string;
  create(input: {
    readonly userId: string;
    readonly name: string;
    readonly expiresIn?: number | null;
  }): Promise<{ readonly key: ApiKeySummary; readonly secret: string }>;
  remove(id: string): Promise<void>;
  list(userId: string): Promise<readonly ApiKeySummary[]>;
}
