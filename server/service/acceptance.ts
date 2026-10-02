import { randomUUID } from 'node:crypto';

import type { JsonObject } from '@nocobase/app-plugin-workflow/server';
import {
  workflowServiceToken,
  type WorkflowTriggerReceipt,
} from '@nocobase/app-plugin-workflow/server';
import type { DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';

import { WORK_ORDER_ACCEPTANCE_WORKFLOW } from './constants.js';

/**
 * Acceptance is the one work-order decision the application hands to a source-managed Workflow. Ordinary form
 * saves and the `start`/`submit`/`confirm`/`return` transitions stay in the application service; only the
 * auto-acceptance that follows creation and the supervisor's accept action are triggered here.
 */
export interface AcceptanceWorkflowInput {
  workOrderId: number;
  mode: 'auto' | 'manual';
  actorId: string | null;
  assigneeId?: string | null;
  /** The locale of the request that triggered acceptance, so the recorded note and message match the user. */
  locale?: string | null;
}

export interface AcceptanceWorkflowLogger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * The workflow service instance exposes discovery/materialization to the plugin, while the public token only
 * declares triggering. The application needs materialization to enable its own workflow at startup, so it reads
 * the extra methods from the same singleton.
 */
interface MaterializableWorkflowService {
  discoverArtifacts(): Promise<
    readonly { key: string; digest: string; origin?: 'dist' | 'source' }[]
  >;
  ensureArtifactMaterialized(
    digest: string,
  ): Promise<string | number | undefined>;
}
/** A distinct event key per attempt lets a failed run be retried; business idempotency lives in the run module. */
export function acceptanceEventKey(
  workOrderId: number,
  mode: 'auto' | 'manual',
): string {
  return `service-work-order-accepted:${mode}:${workOrderId}:${randomUUID()}`;
}

export async function triggerAcceptanceWorkflow(
  resolver: ServiceResolver,
  input: AcceptanceWorkflowInput,
): Promise<WorkflowTriggerReceipt> {
  const workflow = resolver.resolve(workflowServiceToken);
  const payload: JsonObject = {
    workOrderId: input.workOrderId,
    mode: input.mode,
    actorId: input.actorId ?? '',
    assigneeId: input.assigneeId ?? '',
    locale: input.locale ?? '',
  };
  return workflow.trigger(WORK_ORDER_ACCEPTANCE_WORKFLOW, payload, {
    eventKey: acceptanceEventKey(input.workOrderId, input.mode),
    sourceType: 'service-work-order',
    sourceId: String(input.workOrderId),
  });
}

/**
 * Materialize the source-managed acceptance workflow and enable it.
 *
 * The Workflows management page can enable a definition by hand, but the application cannot depend on an
 * operator doing that before the first work order. The step is idempotent and runs on every start, so the
 * acceptance path is never silently inert. A materialization or enablement failure is reported, never fatal.
 */
export async function ensureAcceptanceWorkflowEnabled(
  resolver: ServiceResolver,
  logger: AcceptanceWorkflowLogger,
): Promise<void> {
  let workflow;
  try {
    // The public Workflow contract exposes `trigger` only; the artifact materialization used at boot lives on the
    // concrete service. Widening through `unknown` states that bridge explicitly instead of trusting a structural cast.
    const resolved: unknown = resolver.resolve(workflowServiceToken);
    workflow = resolved as MaterializableWorkflowService;
  } catch {
    logger.warn(
      'The workflow service is not available; the acceptance workflow was not enabled.',
    );
    return;
  }

  const artifacts = await workflow.discoverArtifacts();
  const artifact = artifacts.find(
    (item) => item.key === WORK_ORDER_ACCEPTANCE_WORKFLOW,
  );
  if (!artifact) {
    logger.warn(
      `The "${WORK_ORDER_ACCEPTANCE_WORKFLOW}" workflow source was not found; acceptance will stay manual.`,
    );
    return;
  }

  const workflowId = await workflow.ensureArtifactMaterialized(artifact.digest);
  const database = resolver.resolve<DatabaseManager>(databaseManagerToken);
  const repository = database
    .connection()
    .repository<Record<string, unknown>>('workflows');
  if (workflowId === undefined) {
    // The revision for this build could not be materialized; fall back to enabling whatever is current so the
    // acceptance path is not silently inert, and report it through the same log line.
    await repository.updateMany({
      filter: { key: WORK_ORDER_ACCEPTANCE_WORKFLOW, current: true },
      values: { enabled: true },
    });
  } else {
    // Materializing a new digest registers a revision but leaves the previous one current, so the database would
    // keep pointing at a hash this build no longer ships. Make the deployed revision the current one; a workflow
    // key may have at most one current and enabled revision, so stale state is cleared first.
    await repository.updateMany({
      filter: { key: WORK_ORDER_ACCEPTANCE_WORKFLOW },
      values: { current: null, enabled: false },
    });
    await repository.updateMany({
      filter: { id: workflowId },
      values: { current: true, enabled: true },
    });
  }
  logger.info(
    `Workflow "${WORK_ORDER_ACCEPTANCE_WORKFLOW}" is materialized and enabled.`,
  );
}
