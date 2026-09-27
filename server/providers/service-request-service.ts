import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  createServiceToken,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  ServiceRequestAcceptanceInput,
  ServiceRequestAcceptanceResult,
  ServiceRequestResultInput,
  ServiceRequestWorkflowSteps,
} from '../workflows/service-request-acceptance/server/contracts.js';

export const serviceRequestServiceToken =
  createServiceToken<ServiceRequestService>('service-request/service');

/**
 * The token the isolated workflow Run modules resolve this service through. The
 * string matches the one in
 * `server/workflows/service-request-acceptance/server/contracts.ts`; the Run
 * modules cannot import this module's copy because the Artifact holds its own,
 * so both sides spell the value and a logic test keeps them equal.
 */
export const serviceRequestWorkflowStepsToken =
  'service-request/workflow-steps' as unknown as ServiceToken<ServiceRequestWorkflowSteps>;

export const SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY =
  'service-request-acceptance';

/**
 * The workflow's own execution collection, registered by the Workflow plugin.
 * The acceptance endpoint reads a run's status from it: the plugin's invocation
 * is enqueue-based, so `trigger()` only guarantees a run exists, and the run
 * reaching a terminal status is what proves every node — the notification
 * included — has finished.
 */
const WORKFLOW_RUNS_COLLECTION = 'workflowRuns';

/** `EXECUTION_STATUS` from the Workflow engine. `null` means queued. */
const RUN_STATUS_STARTED = 0;
const RUN_STATUS_RESOLVED = 1;

/** A run the application will wait for before answering an acceptance. */
const ACCEPTANCE_RUN_TIMEOUT_MS = 20_000;
const ACCEPTANCE_RUN_POLL_INTERVAL_MS = 50;

interface WorkflowRunRow {
  id: number | string;
  status: number | null;
}

/** The acceptance reached a terminal but unsuccessful run. */
export class ServiceRequestWorkflowError extends Error {
  public readonly code = 'SERVICE_REQUEST_WORKFLOW_FAILED';

  public constructor(runId: string, status: number | null) {
    super(
      `The service request acceptance workflow run "${runId}" finished with status ${String(status)}.`,
    );
    this.name = 'ServiceRequestWorkflowError';
  }
}

export interface ServiceRequestRecord {
  id: number;
  title: string;
  urgent: boolean;
  assigneeId: string;
  status: string;
  result: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface ServiceRequestAssignee {
  id: string;
  name: string;
}

export interface CreateServiceRequestInput {
  title: string;
  urgent: boolean;
  assigneeId: string;
}

export type ServiceRequestAcceptanceReceipt =
  | { status: 'accepted'; runId: string; request: ServiceRequestRecord }
  | { status: 'skipped'; reason: string };

interface UserRow {
  id: string;
  name: string | null;
  username: string | null;
}

/**
 * Route-facing domain logic for service requests. It owns the business
 * decisions — validation, listing, creation, and which workflow an acceptance
 * invokes — while the routes keep the HTTP concerns.
 *
 * It also implements the workflow's Run steps. Production materializes a
 * workflow's Run modules into an isolated Artifact store that may sit outside
 * the application's `node_modules`, so those modules cannot import the database
 * or notification packages. They resolve this service through
 * {@link serviceRequestWorkflowStepsToken} and call the methods below instead.
 */
export class ServiceRequestService implements ServiceRequestWorkflowSteps {
  public constructor(private readonly resolver: ServiceResolver) {}

  private get requests() {
    const database = this.resolver.resolve(databaseManagerToken);
    return database.repository<ServiceRequestRecord>('serviceRequests');
  }

  public async list(): Promise<ServiceRequestRecord[]> {
    const records = await this.requests.findMany({
      sort: (sort) => sort.field('id').desc(),
    });
    return records.map((record) => this.toRecord(record));
  }

  public async get(id: number): Promise<ServiceRequestRecord | undefined> {
    const record = await this.requests.findOne({ filter: { id } });
    return record ? this.toRecord(record) : undefined;
  }

  public async create(
    input: CreateServiceRequestInput,
  ): Promise<ServiceRequestRecord> {
    const title = input.title.trim();
    if (!title) {
      throw new Error('A service request title is required.');
    }
    const assigneeId = input.assigneeId.trim();
    if (!assigneeId) {
      throw new Error('A service request assignee is required.');
    }
    const created = await this.requests.createOne({
      values: {
        title,
        urgent: Boolean(input.urgent),
        assigneeId,
        status: 'pending',
        result: null,
        acceptedAt: null,
        createdAt: new Date(),
      },
    });
    return this.toRecord(created.record);
  }

  public async findAssignees(): Promise<ServiceRequestAssignee[]> {
    const database = this.resolver.resolve(databaseManagerToken);
    const users = await database.repository<UserRow>('user').findMany({
      sort: (sort) => sort.field('name').asc(),
    });
    return users.map((user) => ({
      id: String(user.id),
      name: String(user.name ?? user.username ?? user.id),
    }));
  }

  /**
   * Trigger the acceptance workflow and wait for it to finish. The workflow
   * owns every business effect, so this method only translates its receipt for
   * the route — but it does wait, because the workflow's invocation is
   * enqueue-based and a caller that returned immediately would answer before
   * the acceptance status, the request's result, and the assignee's message
   * exist.
   */
  public async accept(id: number): Promise<ServiceRequestAcceptanceReceipt> {
    const workflow = this.resolver.resolve(workflowServiceToken);
    const receipt = await workflow.trigger(
      SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY,
      { requestId: String(id) },
      { eventKey: `service-request-accept:${id}` },
    );
    if (receipt.status !== 'accepted') {
      return { status: 'skipped', reason: receipt.reason };
    }
    const status = await this.waitForRun(receipt.runId);
    if (status !== RUN_STATUS_RESOLVED) {
      throw new ServiceRequestWorkflowError(receipt.runId, status);
    }
    const request = await this.get(id);
    if (!request) {
      throw new ServiceRequestWorkflowError(receipt.runId, status);
    }
    return { status: 'accepted', runId: receipt.runId, request };
  }

  /**
   * Poll the workflow run until it leaves the queued/started states. The run
   * row is written by the engine, so this reads the plugin's own collection
   * rather than duplicating completion state in the business table.
   */
  private async waitForRun(runId: string): Promise<number | null> {
    const database = this.resolver.resolve(databaseManagerToken);
    const runs = database.repository<WorkflowRunRow>(WORKFLOW_RUNS_COLLECTION);
    const numericId = Number(runId);
    const filter = Number.isSafeInteger(numericId) ? numericId : runId;
    const deadline = Date.now() + ACCEPTANCE_RUN_TIMEOUT_MS;
    for (;;) {
      const run = await runs.findOne({
        filter: { id: filter },
        select: (select) => select.fields('id', 'status'),
      });
      // `QUEUEING` is null and `STARTED` is 0; anything else is terminal.
      if (run && run.status != null && run.status !== RUN_STATUS_STARTED) {
        return run.status;
      }
      if (Date.now() >= deadline) {
        throw new ServiceRequestWorkflowError(runId, run?.status ?? null);
      }
      await delay(ACCEPTANCE_RUN_POLL_INTERVAL_MS);
    }
  }

  /**
   * Mark the request accepted and return the values the later workflow nodes
   * consume. Repeating the step leaves an already-accepted request untouched.
   */
  public async registerAcceptance(
    input: ServiceRequestAcceptanceInput,
  ): Promise<ServiceRequestAcceptanceResult> {
    const { requestId, id } = parseWorkflowRequestId(input.requestId);
    const request = await this.requests.findOne({ filter: { id } });
    if (!request) {
      throw new Error(`Service request ${requestId} was not found.`);
    }

    if (request.status !== 'accepted') {
      await this.requests.updateMany({
        filter: { id, status: 'pending' },
        values: { status: 'accepted', acceptedAt: new Date() },
      });
    }

    return {
      requestId,
      assigneeId: String(request.assigneeId),
      urgent: Boolean(request.urgent),
      title: String(request.title),
    };
  }

  /**
   * Persist the derived normal/urgent result. The update only fills a
   * still-empty result, so a retried run cannot overwrite the recorded outcome.
   */
  public async recordResult(input: ServiceRequestResultInput): Promise<void> {
    const { requestId, id } = parseWorkflowRequestId(input.requestId);
    const result = input.result;
    if (result !== 'normal' && result !== 'urgent') {
      throw new Error('result must be "normal" or "urgent".');
    }

    const request = await this.requests.findOne({ filter: { id } });
    if (!request) {
      throw new Error(`Service request ${requestId} was not found.`);
    }

    if (request.result == null) {
      // `$empty` compiles to `IS NULL OR = ''`. A plain `result: null` in an
      // object filter becomes `result = NULL`, which matches nothing.
      await this.requests.updateMany({
        filter: (filter) =>
          filter.and([
            filter.number('id').eq(id),
            filter.string('result').empty(),
          ]),
        values: { result },
      });
    }
  }

  /**
   * Send one persistent in-app message to the request assignee. The stable
   * idempotency key keeps a retried run from creating a second inbox item, and
   * the message carries no locale assumption: the sending process does not know
   * the recipient's language, so both languages are included.
   */
  public async notifyAssignee(
    input: ServiceRequestAcceptanceInput,
  ): Promise<void> {
    const { requestId, id } = parseWorkflowRequestId(input.requestId);
    const request = await this.requests.findOne({ filter: { id } });
    if (!request) {
      throw new Error(`Service request ${requestId} was not found.`);
    }

    const priority = localizedWords(Boolean(request.urgent));
    const outcome = localizedWords(request.result === 'urgent');

    const notification = this.resolver.resolve(notificationServiceToken);
    await notification.send({
      idempotencyKey: `service-request-accepted:${id}`,
      source: { type: 'service-request', referenceId: String(id) },
      messages: {
        inbox: {
          to: String(request.assigneeId),
          title: '服务请求已受理 / Service request accepted',
          body:
            `工单「${request.title}」已受理，优先级：${priority.zh}，处理结果：${outcome.zh}。` +
            '\n' +
            `Service request "${request.title}" has been accepted. ` +
            `Priority: ${priority.en}. Result: ${outcome.en}.`,
          target: { type: 'route', path: `/service-requests/${id}` },
        },
      },
    });
  }

  private toRecord(record: ServiceRequestRecord): ServiceRequestRecord {
    return {
      id: Number(record.id),
      title: String(record.title),
      urgent: Boolean(record.urgent),
      assigneeId: String(record.assigneeId),
      status: String(record.status),
      result: record.result == null ? null : String(record.result),
      acceptedAt: record.acceptedAt ?? null,
      createdAt: record.createdAt,
    };
  }
}

/** Binds the route-facing service into the application container. */
export class ServiceRequestServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'service-request/service-provider';

  public override register(): void {
    this.app.container.singleton(
      serviceRequestServiceToken,
      (resolver) => new ServiceRequestService(resolver),
    );
    // The workflow Run modules resolve the same instance through the
    // workflow-step token rather than importing this module's service token.
    this.app.container.singleton(serviceRequestWorkflowStepsToken, (resolver) =>
      resolver.resolve(serviceRequestServiceToken),
    );
  }
}

/**
 * The workflow's own validation of the request id. The workflow input schema
 * already constrains the trigger, but a Run node can be resumed independently,
 * so each step enforces it again.
 */
function parseWorkflowRequestId(rawRequestId: string): {
  requestId: string;
  id: number;
} {
  if (typeof rawRequestId !== 'string' || rawRequestId.length === 0) {
    throw new Error('requestId is required.');
  }
  const id = Number(rawRequestId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('requestId must be a positive integer.');
  }
  return { requestId: rawRequestId, id };
}

function localizedWords(urgent: boolean): { zh: string; en: string } {
  return urgent ? { zh: '紧急', en: 'Urgent' } : { zh: '普通', en: 'Normal' };
}
