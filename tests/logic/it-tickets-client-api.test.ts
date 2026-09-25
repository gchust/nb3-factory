import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import {
  completeTicket,
  createTicket,
  fetchTicket,
  fetchTickets,
  startTicket,
} from '../../client/pages/it-tickets/it-tickets-api.ts';

/**
 * The page's data layer is the only place that knows the endpoint shapes, so
 * pin them here: a wrong method, a path that repeats `/api`, or a body under
 * the wrong key would otherwise only fail in a browser.
 */
function fakeApi(): {
  readonly request: ReturnType<typeof vi.fn>;
  readonly api: ApiClient;
} {
  const request = vi.fn(async () => ({ data: {} }));
  return { request, api: { request } as unknown as ApiClient };
}

describe('IT ticket client API', () => {
  it('lists tickets with an optional status filter and signal', async () => {
    const { request, api } = fakeApi();
    const controller = new AbortController();

    await fetchTickets(api, { status: 'pending', signal: controller.signal });

    expect(request).toHaveBeenCalledWith({
      path: 'it-tickets',
      query: { status: 'pending' },
      signal: controller.signal,
    });
  });

  it('omits the status query when no filter is given', async () => {
    const { request, api } = fakeApi();

    await fetchTickets(api);

    expect(request).toHaveBeenCalledWith({
      path: 'it-tickets',
      query: { status: undefined },
      signal: undefined,
    });
  });

  it('reads one ticket by id', async () => {
    const { request, api } = fakeApi();

    await fetchTicket(api, 7);

    expect(request).toHaveBeenCalledWith({
      path: 'it-tickets/7',
      signal: undefined,
    });
  });

  it('creates a ticket with POST and a JSON body', async () => {
    const { request, api } = fakeApi();

    await createTicket(api, {
      title: 'Broken laptop',
      category: 'computer',
      description: 'Will not boot.',
    });

    expect(request).toHaveBeenCalledWith({
      path: 'it-tickets',
      method: 'POST',
      json: {
        title: 'Broken laptop',
        category: 'computer',
        description: 'Will not boot.',
      },
    });
  });

  it('starts and completes a ticket through their action endpoints', async () => {
    const { request, api } = fakeApi();

    await startTicket(api, 3);
    await completeTicket(api, 3, 'Rebuilt the profile.');

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'it-tickets/3/start',
      method: 'POST',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'it-tickets/3/complete',
      method: 'POST',
      json: { resolutionNote: 'Rebuilt the profile.' },
    });
  });
});
