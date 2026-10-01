import type {
  JsonObject,
  WorkflowServiceContract,
} from '@nocobase/app-plugin-workflow/server';

// Acceptance runs as a Workflow. This module owns the workflow key and the shape of a trigger result, so the work-order
// service can react to `skipped` (the automation is not available) without importing the workflow plugin's internals.
export const AUTO_ACCEPT_WORKFLOW_KEY = 'work-order-auto-accept';

export interface AutoAcceptTriggerInput {
  readonly workOrderId: string;
  /** Monotonic attempt number; part of the event key, so a retry is a new trigger while a duplicate is not. */
  readonly attempt: number;
  readonly eventKey: string;
}

export type AutoAcceptTriggerResult =
  | {
      readonly status: 'accepted';
      readonly eventKey: string;
      readonly runId: string;
    }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface AutoAcceptGateway {
  trigger(input: AutoAcceptTriggerInput): Promise<AutoAcceptTriggerResult>;
}

/**
 * The subset of the workflow service this application uses to make its own
 * deployed workflow runnable. `discoverArtifacts`/`ensureArtifactMaterialized`
 * are the plugin's published runtime entry points for a source-managed
 * definition; the application never writes the materialized workflow tables
 * itself.
 */
export interface AutoAcceptWorkflowRuntime extends WorkflowServiceContract {
  discoverArtifacts(): Promise<
    readonly { readonly key: string; readonly digest: string }[]
  >;
  ensureArtifactMaterialized(hash: string): Promise<unknown>;
}

/**
 * Materializes and activates the workflow revision this application ships.
 *
 * A definition compiled from the source package is materialized disabled and is
 * not discovered until something asks for it, so without this step the first
 * `trigger` reports `not-found`. Activation is what a deployment does to its own
 * source-managed workflow; the application owns the definition and calls the
 * plugin's loader rather than editing the workflow tables.
 */
export async function materializeAutoAcceptWorkflow(
  resolve: () => AutoAcceptWorkflowRuntime | undefined,
): Promise<string | undefined> {
  const workflow = resolve();
  if (!workflow) return undefined;
  const artifacts = await workflow.discoverArtifacts();
  const artifact = artifacts.find(
    (candidate) => candidate.key === AUTO_ACCEPT_WORKFLOW_KEY,
  );
  if (!artifact) return undefined;
  const workflowId = await workflow.ensureArtifactMaterialized(artifact.digest);
  if (typeof workflowId === 'string') return workflowId;
  if (typeof workflowId === 'number') return String(workflowId);
  return undefined;
}

/**
 * The workflow service is registered by a plugin provider, so it is resolved lazily. A trigger that finds no
 * `current` revision is reported as `skipped`; that is a real, retryable condition, not a successful acceptance.
 */
export function createAutoAcceptGateway(
  resolve: () => WorkflowServiceContract | undefined,
): AutoAcceptGateway {
  return {
    async trigger(input): Promise<AutoAcceptTriggerResult> {
      const workflow = resolve();
      if (!workflow) {
        return {
          status: 'unavailable',
          reason: 'WORKFLOW_SERVICE_UNAVAILABLE',
        };
      }
      const payload: JsonObject = {
        workOrderId: input.workOrderId,
        attempt: input.attempt,
      };
      try {
        const receipt = await workflow.trigger(
          AUTO_ACCEPT_WORKFLOW_KEY,
          payload,
          {
            eventKey: input.eventKey,
            sourceType: 'workOrder',
            sourceId: input.workOrderId,
            // A source-managed workflow is activated disabled, so `force` is
            // what lets this application run the definition it ships. It is
            // still a real operation: a missing or invalid workflow reports
            // `skipped`, and the service falls back to a direct message.
            force: true,
          },
        );
        if (receipt.status === 'accepted') {
          return {
            status: 'accepted',
            eventKey: receipt.eventKey,
            runId: receipt.runId,
          };
        }
        return { status: 'skipped', reason: receipt.reason };
      } catch (error) {
        return {
          status: 'unavailable',
          reason:
            error instanceof Error ? error.message : 'WORKFLOW_TRIGGER_FAILED',
        };
      }
    },
  };
}
