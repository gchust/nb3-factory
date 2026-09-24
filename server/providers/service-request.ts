import { databaseManagerToken } from '@nocobase/db';
import type { Repository, RepositoryPolicy } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  workflowServiceToken,
  type JsonObject,
  type WorkflowEventOptions,
  type WorkflowServiceContract,
  type WorkflowTriggerReceipt,
} from '@nocobase/app-plugin-workflow/server';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import {
  SERVICE_REQUEST_COLLECTION,
  SERVICE_REQUEST_PAGES,
  SERVICE_REQUEST_WORKFLOW_KEY,
  type ServiceRequestRecord,
} from '../service-request-model.js';

/**
 * Re-exported so the route and tests read the feature's names from the provider
 * they already import, while `service-request-model.ts` stays the single source.
 */
export {
  SERVICE_REQUEST_COLLECTION,
  SERVICE_REQUEST_PAGES,
  SERVICE_REQUEST_WORKFLOW_KEY,
  type ServiceRequestRecord,
};

export interface CreateServiceRequestInput {
  title: string;
  urgent: boolean;
  assigneeId: string | null;
}

/**
 * A selectable assignee for the create form. It is the minimum of the
 * Authentication-owned `user` row this feature needs to show a picker, read
 * directly because the Users plugin API is a separate administrative surface.
 */
export interface ServiceRequestAssignee {
  id: string;
  name: string;
  email: string;
}

/** The shape this feature reads from the Authentication-owned `user` collection. */
interface UserRow {
  id: string;
  name: string;
  email: string;
}

export type ServiceRequestErrorCode =
  | 'SERVICE_REQUEST_NOT_FOUND'
  | 'SERVICE_REQUEST_NOT_PENDING'
  | 'SERVICE_REQUEST_INVALID_INPUT'
  | 'SERVICE_REQUEST_WORKFLOW_MISSING'
  | 'SERVICE_REQUEST_WORKFLOW_SKIPPED';

export class ServiceRequestError extends Error {
  constructor(
    public readonly code: ServiceRequestErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 500 = 400,
  ) {
    super(message);
    this.name = 'ServiceRequestError';
  }
}

export interface ServiceRequestService {
  list(
    policy: RepositoryPolicy<ServiceRequestRecord>,
  ): Promise<ServiceRequestRecord[]>;
  get(
    policy: RepositoryPolicy<ServiceRequestRecord>,
    id: number,
  ): Promise<ServiceRequestRecord | undefined>;
  create(
    policy: RepositoryPolicy<ServiceRequestRecord>,
    input: CreateServiceRequestInput,
  ): Promise<ServiceRequestRecord>;
  listAssignees(): Promise<ServiceRequestAssignee[]>;
  accept(id: number, options: { locale: string }): Promise<{ runId: string }>;
}

export const serviceRequestServiceToken: ServiceToken<ServiceRequestService> =
  createServiceToken<ServiceRequestService>('app/service-request-service');

/**
 * The public Workflow service is wider than its published contract: the
 * application materializes and triggers the workflow it owns through the same
 * instance. The extra members are used through this local interface rather than
 * by re-creating the token.
 */
interface WorkflowRuntime extends WorkflowServiceContract {
  discoverArtifacts(): Promise<
    readonly { key: string; digest: string; origin?: string }[]
  >;
  ensureArtifactMaterialized(
    digest: string,
  ): Promise<string | number | undefined>;
  triggerRevision(
    revisionId: string | number,
    input: JsonObject,
    options?: WorkflowEventOptions,
  ): Promise<WorkflowTriggerReceipt>;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

class ServiceRequestServiceImpl implements ServiceRequestService {
  constructor(
    private readonly requests: Repository<ServiceRequestRecord>,
    private readonly users: Repository<UserRow>,
    private readonly workflow: WorkflowServiceContract,
  ) {}

  /**
   * Binds the request's resolved database Policy. The Repository enforces the
   * row scope and field allowlist itself, so a restricted caller never reads or
   * writes more than the grants allow. The cast only restores the row type the
   * policy narrows generically; the enforcement happens at runtime.
   */
  private scoped(
    policy: RepositoryPolicy<ServiceRequestRecord>,
  ): Repository<ServiceRequestRecord> {
    return this.requests.withPolicy(
      policy,
    ) as unknown as Repository<ServiceRequestRecord>;
  }

  async list(
    policy: RepositoryPolicy<ServiceRequestRecord>,
  ): Promise<ServiceRequestRecord[]> {
    return this.scoped(policy).findMany({
      sort: (sort) => sort.field('id').desc(),
    });
  }

  async get(
    policy: RepositoryPolicy<ServiceRequestRecord>,
    id: number,
  ): Promise<ServiceRequestRecord | undefined> {
    if (!isPositiveInteger(id)) return undefined;
    return this.scoped(policy).findOne({ filter: { id } });
  }

  async create(
    policy: RepositoryPolicy<ServiceRequestRecord>,
    input: CreateServiceRequestInput,
  ): Promise<ServiceRequestRecord> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_INVALID_INPUT',
        'A service request needs a title.',
        400,
      );
    }
    const assigneeId =
      input.assigneeId === null || input.assigneeId === undefined
        ? null
        : String(input.assigneeId);
    const now = new Date();
    const created = await this.scoped(policy).createOne({
      values: {
        title,
        urgent: input.urgent === true,
        assigneeId,
        status: 'pending',
        // These are plain datetime columns with no implicit behavior, so the
        // writer is responsible for them.
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
    return created.record;
  }

  /**
   * The assignee picker's options. The `user` row is read without the Users
   * plugin's `user/read` grant because this is the application's own endpoint:
   * it exposes only the id and display fields needed to choose a responsible
   * person, and its route is behind the session and this feature's read grant.
   */
  async listAssignees(): Promise<ServiceRequestAssignee[]> {
    const rows = await this.users.findMany({
      sort: (sort) => sort.field('name').asc(),
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
    }));
  }

  async accept(
    id: number,
    options: { locale: string },
  ): Promise<{ runId: string }> {
    // The accept precondition reads the row outside the caller's Policy: the
    // state transition itself is performed by the elevated workflow, and the
    // route has already authorized the caller's `update` grant on the
    // Collection. Row scope still applies through `policyFor` on the route.
    const request = isPositiveInteger(id)
      ? await this.requests.findOne({ filter: { id } })
      : undefined;
    if (!request) {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_NOT_FOUND',
        `Service request ${id} was not found.`,
        404,
      );
    }
    if (request.status !== 'pending') {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_NOT_PENDING',
        'Only a pending service request can be accepted.',
        409,
      );
    }
    const workflow = this.workflow as unknown as WorkflowRuntime;
    const artifacts = await workflow.discoverArtifacts();
    const artifact = artifacts.find(
      (item) => item.key === SERVICE_REQUEST_WORKFLOW_KEY,
    );
    if (!artifact) {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_WORKFLOW_MISSING',
        `Workflow ${SERVICE_REQUEST_WORKFLOW_KEY} is not available in this build.`,
        500,
      );
    }
    const revisionId = await workflow.ensureArtifactMaterialized(
      artifact.digest,
    );
    if (revisionId === undefined) {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_WORKFLOW_MISSING',
        `Workflow ${SERVICE_REQUEST_WORKFLOW_KEY} could not be materialized.`,
        500,
      );
    }
    const receipt = await workflow.triggerRevision(
      revisionId,
      { requestId: id, locale: options.locale },
      {
        // The application owns this definition and runs it as part of the accept
        // action, so it is triggered regardless of the management UI switch.
        force: true,
        // The response carries the accepted record, so wait for the run rather
        // than returning a stale `pending` row to the caller.
        waitForCompletion: true,
        eventKey: `service-request-accept:${id}`,
        sourceType: 'service-request',
        sourceId: String(id),
      },
    );
    if (receipt.status === 'skipped') {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_WORKFLOW_SKIPPED',
        `Workflow ${SERVICE_REQUEST_WORKFLOW_KEY} did not start (${receipt.reason}).`,
        500,
      );
    }
    return { runId: receipt.runId };
  }
}

export default class ServiceRequestProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/service-request-provider';

  public override register(): void {
    this.app.container.singleton(serviceRequestServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new ServiceRequestServiceImpl(
        database.repository<ServiceRequestRecord>(SERVICE_REQUEST_COLLECTION),
        database.repository<UserRow>('user'),
        this.app.container.resolve(workflowServiceToken),
      );
    });
  }

  /**
   * Registers the application's own database Collection and pages with the
   * permission model, so an administrator can see and grant them and so a
   * request can require them. The grant itself lives in the
   * `service-request-user` permission set seed; platform sets are left alone.
   */
  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    authz.db.collections.add({
      name: SERVICE_REQUEST_COLLECTION,
      title: 'Service requests',
    });
    for (const page of SERVICE_REQUEST_PAGES) {
      authz.pages.add({ name: page, actions: ['access'] });
    }
  }
}
