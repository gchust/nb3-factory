import type { FlowContext } from '../workflow';

/**
 * The acceptance rule: only a ticket that still waits for acceptance and was
 * submitted with `accept: true` may continue on the success branch. Everything
 * else, including a ticket already accepted elsewhere, goes to the failure
 * branch where the attempt is recorded.
 */
export function run({ input, nodeResults }: FlowContext): boolean {
  const loaded = nodeResults.loadTicket;
  if (!loaded || !loaded.found) {
    return false;
  }
  return loaded.status === 'pendingAcceptance' && input.accept === true;
}
