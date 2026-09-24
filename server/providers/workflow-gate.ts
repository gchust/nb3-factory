import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import {
  workflowServiceToken,
  type WorkflowServiceContract,
} from '@nocobase/app-plugin-workflow/server';

export const SERVICE_REQUEST_WORKFLOW_KEY = 'service-request-acceptance';

export interface WorkflowGateResult {
  /** Whether the deployed revision of the workflow is now registered, current and enabled. */
  readonly enabled: boolean;
  /** The deployed Artifact digest that was enabled, when one was found. */
  readonly digest?: string;
  /** Why the gate could not enable the workflow, for logging. */
  readonly reason?: string;
}

export interface WorkflowGate {
  /**
   * Make the deployed revision of the acceptance workflow the enabled, current
   * one. Idempotent: running it again when the revision is already enabled
   * writes the same state.
   */
  ensureEnabled(): Promise<WorkflowGateResult>;
}

export const workflowGateToken =
  createServiceToken<WorkflowGate>('crm/workflow-gate');

/** One Artifact as the workflow loader reports it. */
interface WorkflowArtifactSummary {
  readonly key: string;
  readonly digest: string;
}

/**
 * The runtime workflow service exposes discovery and materialization beyond the
 * public `WorkflowServiceContract`. They are declared here rather than reached
 * through `any` so the shape this provider depends on is visible in one place.
 */
interface WorkflowServiceRuntime extends WorkflowServiceContract {
  discoverArtifacts(): Promise<readonly WorkflowArtifactSummary[]>;
  ensureArtifactMaterialized(
    digest: string,
  ): Promise<number | string | undefined>;
}

interface WorkflowRevisionRow {
  id: number | string;
  key: string;
  hash: string | null;
  enabled: boolean;
  current: boolean | null;
}

class WorkflowGateService implements WorkflowGate {
  constructor(private readonly app: Application) {}

  async ensureEnabled(): Promise<WorkflowGateResult> {
    if (!this.app.container.has(workflowServiceToken)) {
      return { enabled: false, reason: 'workflow-service-unavailable' };
    }
    const service = this.app.container.resolve(
      workflowServiceToken,
    ) as WorkflowServiceRuntime;

    let artifacts: readonly WorkflowArtifactSummary[];
    try {
      artifacts = await service.discoverArtifacts();
    } catch (error) {
      return {
        enabled: false,
        reason: `discover-failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const artifact = artifacts.find(
      (candidate) => candidate.key === SERVICE_REQUEST_WORKFLOW_KEY,
    );
    if (!artifact) {
      return { enabled: false, reason: 'artifact-not-deployed' };
    }

    await service.ensureArtifactMaterialized(artifact.digest);

    const revisions = this.app.container
      .resolve(databaseManagerToken)
      .repository<WorkflowRevisionRow>('workflows');

    const target = await revisions.findOne({
      filter: { key: SERVICE_REQUEST_WORKFLOW_KEY, hash: artifact.digest },
    });
    if (!target) {
      return { enabled: false, reason: 'revision-not-materialized' };
    }

    const current = await revisions.findOne({
      filter: { key: SERVICE_REQUEST_WORKFLOW_KEY, current: true },
    });

    if (!current || String(current.hash) !== artifact.digest) {
      // Make the deployed revision current before enabling it. `current` may
      // hold at most one row per key, and an enabled revision must be current,
      // so stale rows are cleared first.
      await revisions.updateMany({
        filter: { key: SERVICE_REQUEST_WORKFLOW_KEY },
        values: { current: null, enabled: false },
      });
      await revisions.updateMany({
        filter: { id: target.id },
        values: { current: true, enabled: true },
      });
    } else if (!current.enabled) {
      await revisions.updateMany({
        filter: { id: target.id },
        values: { enabled: true },
      });
    }

    return { enabled: true, digest: artifact.digest };
  }
}

/**
 * Registers the gate and runs it once at startup so a freshly installed
 * database has the workflow enabled before the first request. A failure here
 * is reported, never thrown: an application that starts with a workflow to
 * enable manually still serves its pages, and the accept route retries the
 * gate before every acceptance.
 */
export class WorkflowGateProvider extends ServiceProvider<Application> {
  readonly name = 'crm/workflow-gate';

  register(): void {
    this.app.container.singleton(
      workflowGateToken,
      () => new WorkflowGateService(this.app),
    );
  }

  async start(): Promise<void> {
    try {
      const result = await this.app.container
        .resolve(workflowGateToken)
        .ensureEnabled();
      if (!result.enabled) {
        console.warn(
          `Service request acceptance workflow was not enabled at startup: ${result.reason ?? 'unknown reason'}`,
        );
      }
    } catch (error) {
      console.warn(
        'Service request acceptance workflow enablement failed',
        error,
      );
    }
  }
}
