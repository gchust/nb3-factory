import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import {
  userAdministrationServiceToken,
  type AdministratedUser,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import {
  workflowServiceToken,
  type WorkflowServiceContract,
} from '@nocobase/app-plugin-workflow/server';

import {
  SERVICE_REQUEST_WORKFLOW_KEY,
  workflowGateToken,
  type WorkflowGate,
} from './workflow-gate.js';

export type ServiceRequestStatus = 'pending' | 'accepted';
export type ServiceRequestResult = 'urgent' | 'normal';

/** A service request as the API and pages consume it. */
export interface ServiceRequestView {
  readonly id: number;
  readonly reference: string;
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string;
  readonly status: ServiceRequestStatus;
  readonly result: ServiceRequestResult | null;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Untyped create body. The service validates each field and reports a failure
 * as `invalid-input`, so the HTTP layer passes the parsed JSON through without
 * trusting its shape.
 */
export interface ServiceRequestCreateInput {
  readonly title: unknown;
  readonly urgent: unknown;
  readonly assigneeId: unknown;
}

export interface ServiceRequestAcceptOutcome {
  readonly request: ServiceRequestView;
  /** The workflow run started for this acceptance, when the trigger accepted it. */
  readonly runId: string | null;
  /** Whether the run reached a terminal state before the bounded wait ended. */
  readonly runFinished: boolean;
  /** True when the request was already accepted and no new run was started. */
  readonly alreadyAccepted: boolean;
}

export interface ServiceRequestAssignee {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export type ServiceRequestErrorCode =
  'not-found' | 'invalid-input' | 'assignee-not-found' | 'workflow-unavailable';

export class ServiceRequestError extends Error {
  constructor(
    readonly code: ServiceRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceRequestError';
  }
}

export interface ServiceRequestsService {
  list(): Promise<ServiceRequestView[]>;
  get(id: number): Promise<ServiceRequestView | undefined>;
  create(input: ServiceRequestCreateInput): Promise<ServiceRequestView>;
  accept(id: number): Promise<ServiceRequestAcceptOutcome>;
  listAssignees(): Promise<ServiceRequestAssignee[]>;
}

export const serviceRequestsServiceToken =
  createServiceToken<ServiceRequestsService>('crm/service-requests');

interface ServiceRequestRow {
  id: number | string;
  reference: string;
  title: string;
  urgent: boolean;
  assigneeId: string;
  status: string;
  result?: string | null;
  acceptedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface WorkflowRunRow {
  id: number | string;
  status?: number | null;
  finishedAt?: Date | string | null;
}

const TITLE_MAX_LENGTH = 200;
const WAIT_STEP_MS = 100;
const WAIT_ATTEMPTS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function toView(row: ServiceRequestRow): ServiceRequestView {
  const result =
    row.result === 'urgent' || row.result === 'normal' ? row.result : null;
  return {
    id: Number(row.id),
    reference: String(row.reference),
    title: String(row.title),
    urgent: Boolean(row.urgent),
    assigneeId: String(row.assigneeId),
    status: row.status === 'accepted' ? 'accepted' : 'pending',
    result,
    acceptedAt: toIso(row.acceptedAt),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  };
}

function readRequestId(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ServiceRequestError(
      'invalid-input',
      'A numeric request id is required.',
    );
  }
  return parsed;
}

function readTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ServiceRequestError('invalid-input', 'A title is required.');
  }
  const title = value.trim();
  if (title.length > TITLE_MAX_LENGTH) {
    throw new ServiceRequestError(
      'invalid-input',
      `The title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
    );
  }
  return title;
}

function readAssigneeId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ServiceRequestError('invalid-input', 'An assignee is required.');
  }
  return value.trim();
}

function readUrgent(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ServiceRequestError(
      'invalid-input',
      'The urgent flag must be a boolean.',
    );
  }
  return value;
}

const REFERENCE_PATTERN = /^REQ-(\d{4})-(\d{4,})$/;

export interface ServiceRequestsDependencies {
  readonly database: DatabaseManager;
  readonly workflowGate: WorkflowGate;
  readonly workflow: WorkflowServiceContract;
  readonly users: UserAdministrationService;
}

class ServiceRequestsServiceImpl implements ServiceRequestsService {
  private readonly requests: Repository<ServiceRequestRow>;
  private readonly runs: Repository<WorkflowRunRow>;

  constructor(private readonly dependencies: ServiceRequestsDependencies) {
    this.requests =
      dependencies.database.repository<ServiceRequestRow>('serviceRequests');
    this.runs =
      dependencies.database.repository<WorkflowRunRow>('workflowRuns');
  }

  async list(): Promise<ServiceRequestView[]> {
    const rows = await this.requests.findMany({
      sort: (sort) => sort.field('id').desc(),
    });
    return rows.map(toView);
  }

  async get(id: number): Promise<ServiceRequestView | undefined> {
    const row = await this.requests.findOne({ filter: { id } });
    return row ? toView(row) : undefined;
  }

  async create(input: ServiceRequestCreateInput): Promise<ServiceRequestView> {
    const title = readTitle(input.title);
    const urgent = readUrgent(input.urgent);
    const assigneeId = readAssigneeId(input.assigneeId);
    await this.assertAssigneeExists(assigneeId);

    const reference = await this.nextReference();
    const now = new Date();
    const created = await this.requests.createOne({
      values: {
        reference,
        title,
        urgent,
        assigneeId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
    return toView(created.record);
  }

  async accept(id: number): Promise<ServiceRequestAcceptOutcome> {
    const requestId = readRequestId(id);
    const existing = await this.requests.findOne({ filter: { id: requestId } });
    if (!existing) {
      throw new ServiceRequestError(
        'not-found',
        `Service request ${requestId} was not found.`,
      );
    }
    if (existing.status === 'accepted') {
      return {
        request: toView(existing),
        runId: null,
        runFinished: true,
        alreadyAccepted: true,
      };
    }

    const gate = await this.dependencies.workflowGate.ensureEnabled();
    if (!gate.enabled) {
      throw new ServiceRequestError(
        'workflow-unavailable',
        `The acceptance workflow is not available: ${gate.reason ?? 'unknown reason'}.`,
      );
    }

    const receipt = await this.dependencies.workflow.trigger(
      SERVICE_REQUEST_WORKFLOW_KEY,
      { requestId: String(requestId) },
    );
    if (receipt.status !== 'accepted') {
      throw new ServiceRequestError(
        'workflow-unavailable',
        `The acceptance workflow did not start: ${receipt.reason}.`,
      );
    }

    const runId = String(receipt.runId);
    const runFinished = await this.waitForRun(runId);
    const updated = await this.requests.findOne({ filter: { id: requestId } });

    return {
      request: toView(updated ?? existing),
      runId,
      runFinished,
      alreadyAccepted: false,
    };
  }

  async listAssignees(): Promise<ServiceRequestAssignee[]> {
    const page = await this.dependencies.users.list({
      page: 1,
      pageSize: 100,
      status: 'enabled',
    });
    return page.items.map((user) => toAssignee(user));
  }

  /**
   * Wait for the workflow run to reach a terminal state so the response the
   * supervisor sees already carries the acceptance result. The wait is bounded:
   * a run that is slow to finish is still a successful acceptance, and the page
   * re-reads the request.
   */
  private async waitForRun(runId: string): Promise<boolean> {
    const id = /^\d+$/.test(runId) ? Number(runId) : runId;
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      const run = await this.runs.findOne({ filter: { id } });
      if (
        run &&
        (run.finishedAt != null || (run.status != null && run.status !== 0))
      ) {
        return true;
      }
      await delay(WAIT_STEP_MS);
    }
    return false;
  }

  private async assertAssigneeExists(assigneeId: string): Promise<void> {
    const user = await this.dependencies.users.get(assigneeId);
    if (!user) {
      throw new ServiceRequestError(
        'assignee-not-found',
        `Assignee "${assigneeId}" was not found.`,
      );
    }
  }

  /**
   * Deterministic reference of the form `REQ-<year>-<sequence>`. The sequence
   * is one past the highest existing sequence for the year, so seeded requests
   * and requests created through the page never collide.
   */
  private async nextReference(): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await this.requests.findMany();
    let highest = 0;
    for (const row of rows) {
      const match = REFERENCE_PATTERN.exec(String(row.reference));
      if (match && Number(match[1]) === year) {
        highest = Math.max(highest, Number(match[2]));
      }
    }
    return `REQ-${year}-${String(highest + 1).padStart(4, '0')}`;
  }
}

function toAssignee(user: AdministratedUser): ServiceRequestAssignee {
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? null,
    email: user.email,
  };
}

/** Build the service from its supplied dependencies; used by the provider and tests. */
export function createServiceRequestsService(
  dependencies: ServiceRequestsDependencies,
): ServiceRequestsService {
  return new ServiceRequestsServiceImpl(dependencies);
}

/**
 * Registers the service and the accept route's dependencies. The providers
 * expose only services; the HTTP layer lives in `server/routes`.
 */
export class ServiceRequestsProvider extends ServiceProvider<Application> {
  readonly name = 'crm/service-requests';

  register(): void {
    this.app.container.singleton(serviceRequestsServiceToken, (container) =>
      createServiceRequestsService({
        database: container.resolve(databaseManagerToken),
        workflowGate: container.resolve(workflowGateToken),
        workflow: container.resolve(workflowServiceToken),
        users: container.resolve(userAdministrationServiceToken),
      }),
    );
  }
}
