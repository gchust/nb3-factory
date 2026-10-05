/**
 * Wires the after-sales service domain into the application.
 *
 * The provider is the only place that turns the domain facade's *ports* into
 * real plugin services. It deliberately resolves them lazily (through getters)
 * so a missing optional plugin degrades the feature it powers instead of
 * failing application construction:
 *
 * - `notification` drives the durable in-app inbox,
 * - `workflow` runs the source-managed acceptance workflow,
 * - `knowledgeIndex` is the AI knowledge base, absent when no model is set.
 *
 * `boot()` is also where the source-managed Workflow, the Scheduler targets and
 * the business Permission Sets become real. All of that runs after every
 * plugin has registered its services and before Scheduler synchronizes its
 * manifest in `start()`, so a failure here is a logged warning and never a
 * startup failure — the application still serves the parts that are configured.
 */
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterNode,
  type RepositoryFilter,
} from '@nocobase/db';
import type { Logger } from '@nocobase/logging';
import type { PermissionGrant } from '@nocobase/authorization';
import { Schedule } from '@nocobase/queue';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import {
  API_KEY_TABLE_NAME,
  ApiKeyService,
} from '@nocobase/app-plugin-api-keys/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import {
  ServiceProvider,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';

import { ServiceAccess } from './access.js';
import { ACCEPTANCE_WORKFLOW_KEY, ServiceOperations } from './operations.js';
import {
  SCHEDULE_KEYS,
  type ApiKeyPort,
  type ApiKeySummary,
  type NotificationPort,
  type ScheduleOccurrence,
  type SchedulePlan,
  type ScheduleRunStatus,
  type ScheduledJob,
  type SchedulerPort,
  type ServiceLogger,
  type WorkflowPort,
} from './ports.js';
import {
  SERVICE_PAGE_IDS,
  SERVICE_PERMISSION_SETS,
  serviceOperationsToken,
} from './tokens.js';
import type { ServiceRole } from './types.js';
import { bool, num, str } from './types.js';

/**
 * The shared password for the demonstration accounts provisioned below.
 *
 * It exists so a reviewer can sign in as each business role and see the
 * record-level access rules for real. It is a demonstration credential for a
 * development database only and is never presented as a production secret.
 */
const DEMO_ACCOUNT_PASSWORD = 'Service123!';

/**
 * The API-key configuration this application issues integration keys under.
 *
 * The API Keys plugin registers one database-backed configuration named
 * `default`; naming it here keeps the integration keys in the same store the
 * Settings page shows, so a supervisor can also see and revoke them there.
 */
const API_KEY_CONFIG_ID = 'default';

/** The Scheduler's own settings page, where a plan's executions are recorded. */
const SCHEDULER_SETTINGS_ID = 'scheduler.schedules';
// The AI employee and AI knowledge-base settings pages share this one page id;
// there is no finer grant, so the supervisor who maintains the equipment manual
// knowledge base receives the whole AI settings area.
const AI_SETTINGS_PAGE_ID = 'ai.settings';

/** How long a manual run waits for its occurrence to reach a final state. */
const RUN_SETTLE_TIMEOUT_MS = 4_000;
const RUN_SETTLE_INTERVAL_MS = 200;

/** The occurrence states the Scheduler never moves again. */
const TERMINAL_OCCURRENCE_STATES: ReadonlySet<string> = new Set([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out',
  'triggered',
]);

type Row = Record<string, unknown>;

/** The subset of the repository filter builder this provider uses. */
interface FilterOps {
  and: (nodes?: readonly FilterNode[]) => FilterNode;
  number: (path: string) => { eq(value: number): FilterNode };
  string: (path: string) => { eq(value: string): FilterNode };
  boolean: (path: string) => { isTrue(): FilterNode };
}

/** The repository filter builder is typed by the repository, so the view is a cast. */
function asFilter(
  fn: (filter: FilterOps) => FilterNode,
): RepositoryFilter<Row> {
  return fn as unknown as RepositoryFilter<Row>;
}

/** Project one `apikey` row into the view the page and the port use. */
function apiKeySummary(value: unknown): ApiKeySummary {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(row.id),
    name: str(row.name) || null,
    prefix: str(row.prefix) || null,
    start: str(row.start) || null,
    enabled: bool(row.enabled),
    createdAt: apiKeyDate(row.createdAt),
    expiresAt: apiKeyDate(row.expiresAt),
    lastRequest: apiKeyDate(row.lastRequest),
  };
}

/** A timestamp from either the plugin (a `Date`) or the row (a string). */
function apiKeyDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return str(value) || null;
}

/** The subset of the Workflow service this provider needs at boot. */
interface WorkflowMaterializer {
  discoverArtifacts(): Promise<
    readonly { readonly key: string; readonly digest: string }[]
  >;
  ensureArtifactMaterialized(hash: string): Promise<number | undefined>;
}

/**
 * The Scheduler's read surface, as the registered service actually carries it.
 *
 * `schedulerServiceToken` is declared publicly with only the registration half
 * (`registerTarget`/`defineSchedule`), but the service bound to it is the same
 * one the plugin's own management routes call, and that one also exposes
 * `list` and `listOccurrences`. Describing those reads locally keeps the page
 * showing a plan's name, timezone, switch and occurrence outcomes through the
 * Scheduler instead of a parallel copy of its records.
 */
interface SchedulerReadService {
  list(): Promise<readonly SchedulerReadRecord[]>;
  listOccurrences(
    scheduleId: string,
  ): Promise<readonly SchedulerReadOccurrence[]>;
}

/** One plan as the Scheduler's list projection returns it. */
interface SchedulerReadRecord {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetState: SchedulePlan['targetState'];
  readonly lifecycleState: SchedulePlan['lifecycleState'];
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
}

/** One execution as the Scheduler's occurrence projection returns it. */
interface SchedulerReadOccurrence {
  readonly id: string;
  readonly status: string;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Record<string, unknown>;
  readonly targetReceipt?: Record<string, unknown>;
}

function optional<T>(
  container: ServiceResolver,
  token: ServiceToken<T>,
): T | undefined {
  return container.has(token) ? container.resolve(token) : undefined;
}

/** Whether a Permission Set already carries a grant, actions included. */
function hasGrant(
  set: { readonly grants: readonly PermissionGrant[] } | undefined,
  grant: PermissionGrant,
): boolean {
  return Boolean(
    set?.grants.some(
      (item) =>
        item.resource.type === grant.resource.type &&
        item.resource.id === grant.resource.id &&
        grant.actions.every((action) =>
          item.actions.some((held) => held.action === action.action),
        ),
    ),
  );
}

/** Bridge the pino logger's object-first calls to the domain's message-first port. */
function serviceLogger(logger: Logger): ServiceLogger {
  const emit =
    (level: 'info' | 'warn' | 'error') =>
    (message: string, meta?: Record<string, unknown>): void => {
      logger[level](meta ?? {}, message);
    };
  return {
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}

/** The occurrence status, which the Scheduler types as its own union. */
function occurrenceStatus(status: string): ScheduleRunStatus {
  return status as ScheduleRunStatus;
}

/**
 * The Scheduler, as the domain uses it.
 *
 * Reading is a straight pass-through. Running a plan is deliberately not: this
 * finds the materialized schedule for the job and triggers it, so the target
 * registered under the plan's own definition executes and the run becomes one
 * of that plan's occurrences — the same record a scheduled firing produces.
 * The Scheduler has no run-now endpoint, and dispatching the job directly is
 * rejected, because an occurrence without a schedule id is not addressable.
 * Nothing here writes an execution record of its own.
 */
function schedulerRunner(
  container: ServiceResolver,
  app: AppPluginApplication,
  warn: (message: string, meta?: Record<string, unknown>) => void,
): SchedulerPort | undefined {
  if (!container.has(schedulerServiceToken)) return undefined;
  // The public token is typed with the registration half only; the service it
  // resolves to is the plugin's own read/management implementation.
  const scheduler = container.resolve(
    schedulerServiceToken,
  ) as unknown as SchedulerReadService;
  const jobs = Object.keys(SCHEDULE_KEYS) as ScheduledJob[];

  const jobFor = (key: string): ScheduledJob | undefined =>
    jobs.find((job) => SCHEDULE_KEYS[job] === key);

  /** The queue connection the Scheduler materialized its own plans on. */
  const adapter = (): string => {
    const queue = app.config.get<{
      default?: string;
      queues?: Record<string, { connection?: string } | undefined>;
    }>('queue');
    return queue?.queues?.schedule?.connection ?? queue?.default ?? '';
  };

  const plans = async (): Promise<readonly SchedulePlan[]> => {
    const items = await scheduler.list();
    const result: SchedulePlan[] = [];
    for (const item of items) {
      const job = jobFor(item.key);
      if (!job) continue;
      result.push({
        job,
        scheduleId: item.id,
        title: item.title,
        cron: item.cron,
        timezone: item.timezone,
        enabled: item.enabled,
        targetState: item.targetState,
        lifecycleState: item.lifecycleState,
        runCount: item.runCount,
        completedCount: item.completedCount,
        nextRunAt: item.nextRunAt,
        lastRunAt: item.lastRunAt,
      });
    }
    return result;
  };

  /**
   * Wait briefly for the occurrence the trigger just queued.
   *
   * The worker writes the record a moment after `trigger()` returns, so a
   * bounded wait turns "submitted" into the real outcome. When it does not
   * arrive the receipt stays honest and reports the run as only dispatched.
   */
  const settle = async (
    scheduleId: string,
    known: ReadonlySet<string>,
  ): Promise<ScheduleOccurrence | undefined> => {
    const deadline = Date.now() + RUN_SETTLE_TIMEOUT_MS;
    let seen: ScheduleOccurrence | undefined;
    for (;;) {
      const fresh = (await scheduler.listOccurrences(scheduleId))
        .filter((row) => !known.has(row.id))
        .map((row) => ({
          id: row.id,
          status: occurrenceStatus(row.status),
          reason: row.reason,
          executionCount: row.executionCount,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          result: row.resultSummary ?? row.targetReceipt,
        }));
      seen =
        fresh.find((row) => TERMINAL_OCCURRENCE_STATES.has(row.status)) ??
        fresh[0] ??
        seen;
      if (seen && TERMINAL_OCCURRENCE_STATES.has(seen.status)) return seen;
      if (Date.now() >= deadline) return seen;
      await new Promise((resolve) =>
        setTimeout(resolve, RUN_SETTLE_INTERVAL_MS),
      );
    }
  };

  return {
    list: plans,
    async occurrences(scheduleId: string) {
      const rows = await scheduler.listOccurrences(scheduleId);
      return rows.map((row) => ({
        id: row.id,
        status: occurrenceStatus(row.status),
        reason: row.reason,
        executionCount: row.executionCount,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        result: row.resultSummary ?? row.targetReceipt,
      }));
    },
    async run(job: ScheduledJob) {
      const plan = (await plans()).find((item) => item.job === job);
      if (!plan) return null;
      // The switch has to hold here too: a manual run goes through the same
      // plan as a scheduled firing, so a switched-off plan must not produce a
      // new result just because someone asked for one. The receipt says it was
      // skipped and carries no result, and the page renders its own localized
      // explanation for that receipt.
      if (!plan.enabled) {
        return {
          job,
          scheduleId: plan.scheduleId,
          title: plan.title,
          timezone: plan.timezone,
          enabled: false,
          status: 'skipped',
          result: undefined,
        };
      }
      const connection = adapter();
      if (!connection) {
        warn(
          `the queue configuration does not resolve the "schedule" connection for ${SCHEDULE_KEYS[job]}`,
        );
        return null;
      }
      const schedule = await Schedule.find(plan.scheduleId, {
        adapter: connection,
      });
      if (!schedule) return null;
      const known = new Set(
        (await scheduler.listOccurrences(plan.scheduleId)).map((row) => row.id),
      );
      await schedule.trigger();
      const occurrence = await settle(plan.scheduleId, known);
      return {
        job,
        scheduleId: plan.scheduleId,
        title: plan.title,
        timezone: plan.timezone,
        enabled: plan.enabled,
        status: occurrence?.status ?? 'dispatched',
        reason: occurrence?.reason,
        result: occurrence?.result,
      };
    },
  };
}

export class ServiceProviderClass extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'app/service';

  public override register(): void {
    const app = this.app;
    const warn = (message: string, meta?: Record<string, unknown>): void => {
      this.logs.warn(message, meta);
    };
    this.app.container.singleton(serviceOperationsToken, () => {
      const container = this.app.container;
      const database = container.resolve(databaseManagerToken);
      const authorization = optional(container, authorizationToken);
      return new ServiceOperations({
        database,
        access: new ServiceAccess({ database, authorization }),
        logger: serviceLogger(
          container.resolve(loggingToken).getLogger('service'),
        ),
        publicBasePath: this.app.publicBasePath,
        get notification(): NotificationPort | undefined {
          return optional<NotificationPort>(
            container,
            notificationServiceToken,
          );
        },
        get workflow(): WorkflowPort | undefined {
          return optional<WorkflowPort>(container, workflowServiceToken);
        },
        // The manual library shows `not_indexed` until a real embedding model
        // is configured; the AI knowledge base port stays undefined rather than
        // pretending a document is searchable.
        get knowledgeIndex() {
          return undefined;
        },
        get scheduler(): SchedulerPort | undefined {
          return schedulerRunner(container, app, warn);
        },
        // Trusted server-side key management: a supervisor issues a key that
        // belongs to the integration account instead of their own account. The
        // list is a read-only projection of the plugin's own table, because the
        // plugin's session-scoped list endpoint would only ever see the caller's
        // keys.
        get apiKeys(): ApiKeyPort | undefined {
          if (!container.has(authenticationToken)) return undefined;
          const auth = container.resolve(authenticationToken);
          const service = new ApiKeyService(auth, API_KEY_CONFIG_ID);
          return {
            configId: API_KEY_CONFIG_ID,
            create: async (input) => {
              const created = await service.create(input);
              return {
                key: apiKeySummary(created.key),
                secret: created.secret,
              };
            },
            remove: (id) => service.remove(id),
            list: async (userId: string) => {
              const rows = await database
                .repository<Row, Row, Row>(API_KEY_TABLE_NAME)
                .findMany({
                  filter: asFilter((filter) =>
                    filter.and([
                      filter.string('referenceId').eq(userId),
                      filter.string('configId').eq(API_KEY_CONFIG_ID),
                    ]),
                  ),
                  sort: (sort) => [sort.field('createdAt').desc()],
                  limit: 200,
                });
              return rows.map(apiKeySummary);
            },
          };
        },
      });
    });
  }

  public override async boot(): Promise<void> {
    // Each step is self-contained and its failure is logged, never thrown: the
    // database may be mid-migration, an optional plugin may be absent, or a
    // harness may boot the runtime without the business tables at all. The
    // application must still serve whatever is configured.
    const steps: readonly [string, () => Promise<void> | void][] = [
      ['permission sets', () => this.ensurePermissionSets()],
      ['demonstration accounts', () => this.provisionDemoAccounts()],
      ['acceptance workflow', () => this.enableAcceptanceWorkflow()],
      ['scheduler targets', () => this.registerSchedules()],
    ];
    for (const [step, run] of steps) {
      try {
        await run();
      } catch (error) {
        this.logs.warn(`service boot step failed: ${step}`, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private get database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get logs(): ServiceLogger {
    return serviceLogger(
      this.app.container.resolve(loggingToken).getLogger('service'),
    );
  }

  // ------------------------------------------------------------ permissions

  private async ensurePermissionSets(): Promise<void> {
    const container = this.app.container;
    if (!container.has(authorizationToken)) return;
    const authorization = container.resolve(authorizationToken);
    const pageGrant = (id: string): PermissionGrant => ({
      resource: { type: 'page', id },
      actions: [{ action: 'access' }],
    });
    const grants: Record<string, readonly PermissionGrant[]> = {
      [SERVICE_PERMISSION_SETS.manager]: [
        ...Object.values(SERVICE_PAGE_IDS).map(pageGrant),
        // The plans this application registers are also readable where the
        // Scheduler shows every plan and its execution records: the supervisor
        // opens that settings page to read a plan's name, timezone, switch and
        // outcomes, so the manager set needs the settings entry to see the page
        // and the page resource the Scheduler's own API checks.
        {
          resource: { type: 'settings', id: SCHEDULER_SETTINGS_ID },
          actions: [{ action: 'read' }],
        },
        pageGrant(SCHEDULER_SETTINGS_ID),
        // The supervisor maintains the internal equipment-manual knowledge base
        // and checks its processing status, and reads the assistant's readiness,
        // so the manager needs the AI settings page the plugin's own API checks
        // (`page:ai.settings`). Engineers deliberately do not get it: the same
        // page also carries manual upload and deletion, which they must not have.
        pageGrant(AI_SETTINGS_PAGE_ID),
      ],
      [SERVICE_PERMISSION_SETS.engineer]: [
        SERVICE_PAGE_IDS.dashboard,
        SERVICE_PAGE_IDS.workOrders,
        SERVICE_PAGE_IDS.equipment,
        SERVICE_PAGE_IDS.customers,
        SERVICE_PAGE_IDS.inspections,
        SERVICE_PAGE_IDS.knowledge,
        SERVICE_PAGE_IDS.manuals,
        SERVICE_PAGE_IDS.assistant,
        SERVICE_PAGE_IDS.messages,
      ].map(pageGrant),
      [SERVICE_PERMISSION_SETS.observer]: [
        pageGrant(SERVICE_PAGE_IDS.workOrders),
        pageGrant(SERVICE_PAGE_IDS.messages),
      ],
      [SERVICE_PERMISSION_SETS.integrator]: [
        pageGrant(SERVICE_PAGE_IDS.integration),
        pageGrant(SERVICE_PAGE_IDS.messages),
      ],
    };
    for (const [key, setGrants] of Object.entries(grants)) {
      try {
        const existing = await authorization.permissionSets.get(key);
        const missing = setGrants.filter((grant) => !hasGrant(existing, grant));
        if (missing.length === 0) continue;
        if (existing) {
          // A set created by an earlier version keeps its grants and gains only
          // what this version needs, so a deployment that already has users is
          // repaired without rewriting their assignments.
          await authorization.permissionSets.update(key, {
            ...existing,
            grants: [...existing.grants, ...missing],
          });
          this.logs.info(`extended permission set ${key}`, {
            pages: missing.map((grant) => grant.resource.id),
          });
          continue;
        }
        await authorization.permissionSets.create({
          key,
          title: key,
          grants: setGrants,
        });
        this.logs.info(`created permission set ${key}`, {
          pages: setGrants.map((grant) => grant.resource.id),
        });
      } catch (error) {
        // A concurrent boot or a hand-managed installation must not break startup.
        this.logs.warn(`could not ensure permission set ${key}`, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private permissionSetForRole(kind: string): string | null {
    const roleByKind: Record<string, ServiceRole> = {
      manager: 'manager',
      engineer: 'engineer',
      observer: 'observer',
      integrator: 'integrator',
    };
    const mapped = roleByKind[kind];
    return mapped ? SERVICE_PERMISSION_SETS[mapped] : null;
  }

  private usernameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? email;
    return local.replace(/[^a-zA-Z0-9_.]/g, '.').slice(0, 30) || 'service.user';
  }

  /**
   * Link every demonstration seat to a real account once.
   *
   * The seats are seeded with an e-mail but no account, because a database seed
   * cannot hash a password through Better Auth. Here the account is created
   * through the authentication plugin's administration service, the matching
   * Permission Set is assigned, and the seat records the account id — so the
   * record-level access rules can be exercised by signing in as each role.
   */
  private async provisionDemoAccounts(): Promise<void> {
    const container = this.app.container;
    if (!container.has(userAdministrationServiceToken)) return;
    if (!container.has(authorizationToken)) return;
    const users = container.resolve(userAdministrationServiceToken);
    const authorization = container.resolve(authorizationToken);
    const seats = await this.database
      .repository<Row, Row, Row>('serviceEngineerMembers')
      .findMany({ sort: (sort) => sort.field('id').asc() });
    for (const seat of seats) {
      if (str(seat.userId)) continue;
      const email = str(seat.email).toLowerCase();
      if (!email) continue;
      try {
        const page = await users.list({ search: email, pageSize: 50 });
        const account =
          page.items.find((item) => item.email.toLowerCase() === email) ??
          (await users.create({
            name: str(seat.name) || email,
            email,
            username: this.usernameFromEmail(email),
            password: DEMO_ACCOUNT_PASSWORD,
          }));
        const permissionSet = this.permissionSetForRole(str(seat.kind));
        if (permissionSet) {
          const assignments =
            await authorization.permissionSets.listAssignments(permissionSet);
          const assigned = assignments.some(
            (item) =>
              item.subject.type === 'user' && item.subject.id === account.id,
          );
          if (!assigned) {
            await authorization.permissionSets.assign({
              subject: { type: 'user', id: account.id },
              permissionSet,
            });
          }
        }
        await this.database
          .repository<Row, Row, Row>('serviceEngineerMembers')
          .updateMany({
            filter: asFilter((filter) =>
              filter.number('id').eq(num(seat.id) ?? -1),
            ),
            values: { userId: account.id, updatedAt: new Date() },
          });
        this.logs.info(`linked service seat ${str(seat.ref)} to an account`, {
          permissionSet,
        });
      } catch (error) {
        this.logs.warn(
          `could not provision account for seat ${str(seat.ref)}`,
          {
            reason: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  // ---------------------------------------------------------------- workflow

  /**
   * Register and enable the source-managed acceptance workflow.
   *
   * `discoverArtifacts()` compiles `server/workflows` in development and lists
   * the committed Artifacts in production; `ensureArtifactMaterialized()` makes
   * the definition addressable, but always leaves it disabled. Enablement is a
   * real business switch, so it is flipped here deliberately — and
   * `runAcceptance` additionally triggers with `force`, so a hand-disabled
   * workflow never blocks a supervisor's acceptance.
   */
  private async enableAcceptanceWorkflow(): Promise<void> {
    const container = this.app.container;
    if (!container.has(workflowServiceToken)) return;
    const workflow = container.resolve(
      workflowServiceToken,
    ) as unknown as WorkflowMaterializer;
    if (typeof workflow.discoverArtifacts !== 'function') return;
    try {
      const artifacts = await workflow.discoverArtifacts();
      const artifact = artifacts.find(
        (item) => item.key === ACCEPTANCE_WORKFLOW_KEY,
      );
      if (!artifact) {
        this.logs.warn('acceptance workflow source was not found', {
          key: ACCEPTANCE_WORKFLOW_KEY,
        });
        return;
      }
      await workflow.ensureArtifactMaterialized(artifact.digest);
      // Publish the revision this build deployed, addressed by its Artifact
      // hash rather than by `current = true`.
      //
      // The same source produces different digests in development and in
      // production (development keeps `.ts` run modules, production ships the
      // compiled `.js`), and `boot()` runs against a database that may already
      // hold the previous build's current revision. Enabling whatever is
      // `current` would enable the old hash, whose artifact this build does not
      // contain, so every acceptance run fails with "Artifact ... is missing
      // from this build". The plugin's own management "enable" makes the
      // selected revision the key's single current, enabled revision; this is
      // that same state change for the artifact this build materialized.
      await this.database.transaction(async (connection) => {
        const workflows = connection.repository<Row, Row, Row>('workflows');
        await workflows.updateMany({
          filter: asFilter((filter) =>
            filter.string('key').eq(ACCEPTANCE_WORKFLOW_KEY),
          ),
          values: { current: null, enabled: false },
        });
        await workflows.updateMany({
          filter: asFilter((filter) =>
            filter.and([
              filter.string('key').eq(ACCEPTANCE_WORKFLOW_KEY),
              filter.string('hash').eq(artifact.digest),
            ]),
          ),
          values: { current: true, enabled: true },
        });
      });
      this.logs.info('acceptance workflow is materialized and enabled', {
        digest: artifact.digest,
      });
    } catch (error) {
      this.logs.warn('could not enable the acceptance workflow', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --------------------------------------------------------------- scheduler

  private registerSchedules(): void {
    const container = this.app.container;
    if (!container.has(schedulerServiceToken)) return;
    const scheduler = container.resolve(schedulerServiceToken);
    const operations = (): ServiceOperations =>
      container.resolve(serviceOperationsToken);
    const validateObject = (config: unknown) =>
      config !== null && typeof config === 'object' && !Array.isArray(config)
        ? { valid: true as const }
        : { valid: false as const, reason: 'config-must-be-an-object' };

    scheduler.registerTarget({
      type: 'app.service.daily-inspections',
      title: 'Generate daily inspection tasks',
      validate: validateObject,
      start: async () => {
        const result = await operations().generateDailyInspections({});
        this.logs.info('daily inspection generation finished', result);
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: {
            created: num(result.created) ?? 0,
            skipped: num(result.skipped) ?? 0,
          },
        };
      },
    });

    scheduler.registerTarget({
      type: 'app.service.overdue-reminders',
      title: 'Send overdue inspection reminders',
      validate: validateObject,
      start: async () => {
        const result = await operations().sendOverdueReminders({});
        this.logs.info('overdue inspection reminders finished', result);
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { reminded: num(result.reminded) ?? 0 },
        };
      },
    });

    scheduler.defineSchedule({
      key: SCHEDULE_KEYS['daily-inspections'],
      title: '服务巡检任务生成 / Daily service inspections',
      description:
        'Creates one inspection task per enabled device whose planned inspection date has arrived.',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.daily-inspections', config: {} },
    });
    scheduler.defineSchedule({
      key: SCHEDULE_KEYS['overdue-reminders'],
      title: '服务巡检逾期提醒 / Overdue inspection reminders',
      description:
        'Marks overdue inspection tasks and sends the assignee one in-app reminder per task per day.',
      schedule: { cron: '0 10 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.service.overdue-reminders', config: {} },
    });
  }
}

export default ServiceProviderClass;
