// @vitest-environment node

import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import {
  fetchContact,
  fetchContacts,
  fetchCustomer,
  fetchCustomerDetail,
  fetchCustomers,
  fetchOpportunities,
  fetchOpportunity,
  normalizeOpportunity,
} from '../../client/pages/crm/crm-api.ts';
import type { Opportunity } from '../../client/pages/crm/types.ts';

/** A stand-in for the application's API client that records the request it was handed. */
function stubApi(response: unknown): {
  readonly api: ApiClient;
  readonly requests: Record<string, unknown>[];
} {
  const requests: Record<string, unknown>[] = [];
  const api = {
    request: async (options: Record<string, unknown>) => {
      requests.push(options);
      return response;
    },
  } as unknown as ApiClient;
  return { api, requests };
}

describe('CRM client API', () => {
  it('reads the collection paths the server route mounts', async () => {
    const { api, requests } = stubApi({ data: [] });
    await fetchCustomers(api);
    await fetchContacts(api);
    await fetchOpportunities(api);
    expect(requests.map((request) => request.path)).toEqual([
      'crm/customers',
      'crm/contacts',
      'crm/opportunities',
    ]);
  });

  it('drops an empty search and forwards a real one', async () => {
    const { api, requests } = stubApi({ data: [] });
    await fetchCustomers(api, { search: '' });
    await fetchContacts(api, { search: 'ada', customerId: 7 });
    await fetchOpportunities(api, { stage: 'won' });
    expect(requests[0].query).toEqual({ search: undefined });
    expect(requests[1].query).toEqual({ search: 'ada', customerId: 7 });
    expect(requests[2].query).toEqual({
      search: undefined,
      customerId: undefined,
      stage: 'won',
    });
  });

  it('addresses each record endpoint by id', async () => {
    const { api, requests } = stubApi({ data: {} });
    await fetchCustomer(api, 3);
    await fetchCustomerDetail(api, 3);
    await fetchContact(api, 4);
    await fetchOpportunity(api, 5);
    expect(requests.map((request) => request.path)).toEqual([
      'crm/customers/3',
      'crm/customers/3/detail',
      'crm/contacts/4',
      'crm/opportunities/5',
    ]);
  });

  it('coerces the amount and stage of an opportunity before it reaches the UI', async () => {
    const row = {
      id: 5,
      name: 'Data platform',
      customerId: 1,
      customerName: 'Star Sea',
      amount: '80000.00',
      stage: 'won',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Opportunity;

    const { api } = stubApi({ data: row });
    const opportunity = await fetchOpportunity(api, 5);
    expect(opportunity.amount).toBe(80000);
    expect(opportunity.stage).toBe('won');
  });

  it('falls back to the first stage for a value the UI does not know', () => {
    const normalized = normalizeOpportunity({
      ...({} as Opportunity),
      amount: 12.5,
      stage: 'not-a-stage' as Opportunity['stage'],
    });
    expect(normalized.stage).toBe('follow_up');
    expect(normalized.amount).toBe(12.5);
  });

  it('normalizes every row of a list, not only a single record', async () => {
    const { api } = stubApi({
      data: [
        { amount: '1.10', stage: 'won' },
        { amount: null, stage: 'lost' },
      ],
    });
    const rows = await fetchOpportunities(api);
    expect(rows.map((row) => [row.amount, row.stage])).toEqual([
      [1.1, 'won'],
      [0, 'lost'],
    ]);
  });
});
