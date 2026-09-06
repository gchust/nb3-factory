import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import {
  listStaff,
  listTickets,
  updateTicket,
} from '../../client/lib/it-service-desk-api.js';

/**
 * Regression test for the DEF-1 crash: `listStaff` must request
 * `it-service-desk/tickets/staff` (the staff endpoint lives under the tickets
 * sub-router). A bare `it-service-desk/staff` request falls through to the SPA
 * catch-all, returns HTML, and `response.data` is undefined — which crashed the
 * edit form's `staff.map` with "Cannot read properties of undefined (reading
 * 'map')".
 */
describe('it-service-desk client API', () => {
  function createClient() {
    const request = vi.fn<AppClient['request']>();
    const appClient = { request } as unknown as AppClient;
    return { appClient, request };
  }

  it('listStaff requests the staff endpoint under the tickets sub-router', async () => {
    const { appClient, request } = createClient();
    request.mockResolvedValue({
      data: [
        { id: 'user-1', name: 'Wei Zhang', email: 'zhang.wei@example.com' },
      ],
    });

    const staff = await listStaff(appClient);

    expect(request).toHaveBeenCalledWith('it-service-desk/tickets/staff');
    expect(staff).toHaveLength(1);
    expect(staff[0]?.name).toBe('Wei Zhang');
  });

  it('listTickets requests the tickets list with filters', async () => {
    const { appClient, request } = createClient();
    request.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20 },
    });

    await listTickets(appClient, { status: 'pending', search: 'printer' });

    expect(request).toHaveBeenCalledWith(
      'it-service-desk/tickets?status=pending&search=printer',
    );
  });

  it('updateTicket sends the assignee id on the tickets sub-router', async () => {
    const { appClient, request } = createClient();
    request.mockResolvedValue({ data: { id: 1 } });

    await updateTicket(appClient, 1, { assigneeId: 'user-2' });

    expect(request).toHaveBeenCalledWith(
      'it-service-desk/tickets/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ assigneeId: 'user-2' }),
      }),
    );
  });
});
