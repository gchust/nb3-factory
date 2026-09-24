import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { ServiceRequest } from './types.js';

/**
 * The accept endpoint starts the acceptance workflow and returns as soon as the
 * run is accepted; the run itself continues asynchronously, so the record is
 * still `processing` for a moment afterwards. Reading it once would leave the
 * list showing "Processing" until a manual refresh, so the caller waits for the
 * record to settle before reloading.
 *
 * The poll is deliberately short and bounded: if the workflow does not settle
 * (a failed node, a slow run), the caller reloads whatever the current state is
 * rather than hanging the interaction.
 */
const POLL_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 15;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForAcceptance(
  api: Pick<ApiClient, 'request'>,
  id: number,
): Promise<ServiceRequest | undefined> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);
    try {
      const response = await api.request<{ data: ServiceRequest }>({
        path: `service-requests/${id}`,
      });
      if (response.data.status !== 'processing') return response.data;
    } catch (error) {
      // A missing record or a transient failure ends the wait; the caller's
      // reload is what shows the real state.
      if (error instanceof ApiClientError) return undefined;
    }
  }
  return undefined;
}
