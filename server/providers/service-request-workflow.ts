import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY } from './service-request-service.js';

/** The subset of the internal workflow service needed to bootstrap a source workflow. */
interface WorkflowArtifactSummary {
  readonly key: string;
  readonly digest: string;
}

interface WorkflowBootstrapService {
  discoverArtifacts(): Promise<readonly WorkflowArtifactSummary[]>;
  ensureArtifactMaterialized(
    hash: string,
  ): Promise<number | string | undefined>;
}

interface WorkflowRow {
  id: number;
  key: string;
  hash: string;
  current: boolean | null;
  enabled: boolean;
}

/**
 * The acceptance workflow is application source. Enabling it is the deployment
 * step the Workflow plugin deliberately leaves to the application, so the
 * application performs it once at startup: resolve the source revision for the
 * workflow key, register it when needed, and make it the current, enabled
 * revision. Re-running is a no-op once the current revision matches.
 *
 * The application must still start when the database or the Workflow plugin is
 * absent (some embedded deployments omit both), so every failure here is logged
 * and swallowed instead of aborting startup.
 */
export class ServiceRequestWorkflowProvider extends ServiceProvider<Application> {
  public readonly name: string = 'service-request/workflow-provider';

  public override async start(): Promise<void> {
    const { container } = this.app;
    if (!container.has(databaseManagerToken)) return;
    if (!container.has(workflowServiceToken)) return;

    try {
      // `workflowServiceToken` is typed with the narrow public contract; the
      // bootstrap methods live on the same instance and are safe to call here.
      const workflow = container.resolve(
        workflowServiceToken,
      ) as unknown as WorkflowBootstrapService;
      const artifact = (await workflow.discoverArtifacts()).find(
        (item) => item.key === SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY,
      );
      if (!artifact) {
        console.warn(
          `Service request workflow "${SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY}" was not found in the build.`,
        );
        return;
      }

      const workflowId = await workflow.ensureArtifactMaterialized(
        artifact.digest,
      );
      if (workflowId === undefined) {
        console.warn(
          `Service request workflow "${SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY}" could not be materialized.`,
        );
        return;
      }

      const database = container.resolve(databaseManagerToken);
      const workflows = database.repository<WorkflowRow>('workflows');
      const current = await workflows.findOne({
        filter: { key: SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY, current: true },
      });
      if (
        current &&
        String(current.id) === String(workflowId) &&
        current.enabled
      ) {
        return;
      }

      // A key may have at most one current, enabled revision. Clear stale state
      // first so a historical row cannot stay enabled after this activation.
      await workflows.updateMany({
        filter: { key: SERVICE_REQUEST_ACCEPTANCE_WORKFLOW_KEY },
        values: { current: null, enabled: false },
      });
      await workflows.updateMany({
        filter: { id: workflowId as number },
        values: { current: true, enabled: true },
      });
    } catch (error) {
      console.warn(
        `Service request workflow bootstrap failed; the acceptance flow will not run until it succeeds.`,
        error,
      );
    }
  }
}
