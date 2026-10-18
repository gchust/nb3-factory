import type { ApiClient } from '@nocobase/app-client';

import type { Ticket } from '../types.js';

/** Fire a manual lifecycle transition through the help-desk service. */
export async function fireTicket(
  api: ApiClient,
  id: string,
  transition: string,
  input: Record<string, unknown>,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: `tickets/${encodeURIComponent(id)}/fire`,
    method: 'POST',
    json: { transition, input },
  });
  return data;
}
