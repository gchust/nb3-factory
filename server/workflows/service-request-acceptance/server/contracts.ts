import type { ServiceToken } from '@nocobase/service-provider';

export interface ServiceRequestAcceptanceInput {
  requestId: string;
}

export interface ServiceRequestAcceptanceResult {
  requestId: string;
  assigneeId: string;
  urgent: boolean;
  title: string;
}

export interface ServiceRequestResultInput {
  requestId: string;
  result: 'normal' | 'urgent';
}

/**
 * Read the request id off a Run node's arguments. It is runtime code in this
 * dependency-free module so every Run module validates the same way without
 * importing anything the isolated Artifact store cannot resolve.
 */
export function readRequestId(rawArgs: unknown): string {
  const requestId = (rawArgs as { requestId?: unknown } | null)?.requestId;
  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new Error('requestId is required.');
  }
  return requestId;
}

/**
 * The application-owned steps the three Run nodes call.
 *
 * This indirection exists because the Run modules are copied into an isolated
 * Artifact store in production. The store can live outside the application's
 * `node_modules` — a deployment is free to put the private drive on its own
 * volume — so a Run module cannot import `@nocobase/db` or the notification
 * package as a value: the bare specifier would have no resolution path there.
 * This local, dependency-free module is the only thing they import, and they
 * reach the real work through the container token below.
 *
 * The implementation and the matching token live in
 * `server/providers/service-request-service.ts`.
 */
export interface ServiceRequestWorkflowSteps {
  registerAcceptance(
    input: ServiceRequestAcceptanceInput,
  ): Promise<ServiceRequestAcceptanceResult>;
  recordResult(input: ServiceRequestResultInput): Promise<void>;
  notifyAssignee(input: ServiceRequestAcceptanceInput): Promise<void>;
}

/**
 * Token the Run modules use to resolve {@link ServiceRequestWorkflowSteps}.
 *
 * It is a plain string on purpose. `createServiceToken` produces an object the
 * container matches by identity, and the Artifact holds its own copy of this
 * module, so two same-named objects would not match. A string compares by
 * value, so the provider's copy and the Artifact's copy resolve the same
 * binding. The provider spells the same string; a logic test keeps them equal.
 */
export const serviceRequestWorkflowStepsToken =
  'service-request/workflow-steps' as unknown as ServiceToken<ServiceRequestWorkflowSteps>;
