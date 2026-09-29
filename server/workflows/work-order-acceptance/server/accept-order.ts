import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';
import type { ServiceToken } from '@nocobase/service-provider';

import {
  SERVICE_DOMAIN_SERVICE_KEY,
  type AcceptanceService,
} from '../contract.ts';

/**
 * Accept a work order and notify its assignee.
 *
 * The service is resolved by the stable key declared in `../contract.ts`
 * rather than by importing application source: this module is copied into the
 * workflow Artifact and, in a production build, loaded from that materialized
 * Artifact, where a relative import leaving the package would not resolve.
 * `acceptWorkOrder` is idempotent, so a repeated delivery of the same event
 * changes nothing and sends no second notification.
 */
const acceptanceServiceToken: ServiceToken<AcceptanceService> =
  SERVICE_DOMAIN_SERVICE_KEY as unknown as ServiceToken<AcceptanceService>;

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
  options,
): Promise<WorkflowRunJsonValue> => {
  options.signal.throwIfAborted();
  const args = rawArgs as { workOrderId?: unknown; priority?: unknown };
  if (typeof args.workOrderId !== 'string' || args.workOrderId.length === 0) {
    throw new Error('workOrderId is required.');
  }
  if (!options.services.has(acceptanceServiceToken)) {
    return { accepted: false, reason: 'service-unavailable' };
  }
  const service = options.services.resolve(acceptanceServiceToken);
  const order = await service.acceptWorkOrder(args.workOrderId, undefined, {
    auto: true,
  });
  return {
    accepted: order?.status === 'pending_process',
    status: typeof order?.status === 'string' ? order.status : 'unknown',
  };
};
