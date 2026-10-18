import type { AuthorizationCheck } from '@nocobase/app-plugin-authorization/client';

/**
 * The composite resource `server/service-desk/resources.ts` registers. Its actions
 * (`view`, `create`, `assign`, `resolve`, `confirm`, `return`, `comment`, `dashboard`)
 * are what the pages ask `useCan` about before offering a button.
 */
export const SERVICE_DESK_RESOURCE = 'serviceDesk.tickets';

export function serviceDeskRequirement(action: string): AuthorizationCheck {
  return { resource: { type: 'composite', id: SERVICE_DESK_RESOURCE }, action };
}
