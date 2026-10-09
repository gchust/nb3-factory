import type { Application } from '@nocobase/app-server/application';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

/** The stable key of the application-owned acceptance workflow. */
const ACCEPTANCE_WORKFLOW_KEY = 'ticket-acceptance';

/**
 * The workflow runtime methods this provider needs. `workflowServiceToken` is
 * published under the narrower `WorkflowServiceContract`; the service object
 * behind it also exposes artifact materialization, which is what activation
 * uses to create the revision row before marking it current and enabled.
 */
interface WorkflowActivationRuntime {
  discoverArtifacts(): Promise<readonly { key: string; digest: string }[]>;
  ensureArtifactMaterialized(digest: string): Promise<number | undefined>;
}

/**
 * Activates the application-owned ticket acceptance workflow.
 *
 * Workflow enablement is deliberately a management decision in the platform:
 * a discovered Artifact is materialized but stays disabled until someone
 * enables it. A business application that ships a source-managed workflow
 * still has to be operable the moment it is installed, so this provider
 * materializes the current Artifact and marks that revision current and
 * enabled. It is idempotent: an already enabled revision is left untouched,
 * and a rebuild that produces a new Artifact hash activates the new revision
 * instead of silently running the old one.
 *
 * This runs on every start, but does nothing when the workflow plugin is
 * absent, so the application still starts without it.
 */
export default class EquipmentWorkflowProvider extends ServiceProvider<Application> {
  public readonly name = 'app/equipment-workflow';

  public override async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(workflowServiceToken)) {
      return;
    }
    try {
      const service = container.resolve(
        workflowServiceToken,
      ) as unknown as WorkflowActivationRuntime;
      const artifact = (await service.discoverArtifacts()).find(
        (candidate) => candidate.key === ACCEPTANCE_WORKFLOW_KEY,
      );
      if (!artifact) {
        return;
      }
      const workflowId = await service.ensureArtifactMaterialized(
        artifact.digest,
      );
      if (!workflowId) {
        return;
      }
      const workflows = container
        .resolve(databaseManagerToken)
        .repository('workflows');
      const current = await workflows.findOne({
        filter: {
          key: ACCEPTANCE_WORKFLOW_KEY,
          enabled: true,
          current: true,
        },
      });
      // `ensureArtifactMaterialized` created (or reused) this build's revision
      // but left it disabled. An enabled revision is left alone only when it is
      // this build's revision; otherwise the revision this build's source
      // produced takes over, so a rebuild with a new Artifact hash does not keep
      // running the previous one.
      const currentHash = current?.hash;
      if (typeof currentHash === 'string' && currentHash === artifact.digest) {
        return;
      }
      // A workflow key has at most one enabled revision, and it must be the
      // current one, so the previous revision's state is cleared first.
      await workflows.updateMany({
        filter: { key: ACCEPTANCE_WORKFLOW_KEY },
        values: { current: null, enabled: false },
      });
      await workflows.updateOne({
        filter: { id: workflowId },
        values: { current: true, enabled: true },
      });
    } catch (error) {
      console.warn(
        '[service] ticket acceptance workflow activation was skipped',
        error,
      );
    }
  }
}
