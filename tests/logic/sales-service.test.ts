import { describe, expect, it } from 'vitest';

import {
  SalesService,
  totalOpportunityAmount,
} from '../../server/providers/sales-service.js';
import { MemorySalesStore } from '../fixtures/sales-store.js';

function createService(): SalesService {
  return new SalesService(
    new MemorySalesStore({
      customers: [
        { id: 1, name: 'Acme Manufacturing', industry: 'Manufacturing' },
        { id: 2, name: 'Northwind Retail', industry: 'Retail' },
      ],
      contacts: [
        { id: 11, name: 'Alice Chen', customerId: 1 },
        { id: 12, name: 'David Park', customerId: 1 },
        { id: 13, name: 'Emma Wu', customerId: 2 },
      ],
      opportunities: [
        {
          id: 21,
          name: 'Acme plant upgrade',
          customerId: 1,
          amount: 120000,
          stage: 'following',
        },
        {
          id: 22,
          name: 'Acme annual support',
          customerId: 1,
          amount: 30000,
          stage: 'won',
        },
        {
          id: 23,
          name: 'Acme parts',
          customerId: 1,
          amount: 10000,
          stage: 'lost',
        },
        {
          id: 24,
          name: 'Northwind POS rollout',
          customerId: 2,
          amount: 80000,
          stage: 'following',
        },
      ],
    }),
  );
}

describe('sales service', () => {
  it('returns a customer with only that customer’s contacts and opportunities', async () => {
    const detail = await createService().getCustomerDetail(1);

    expect(detail).toBeDefined();
    expect(detail?.name).toBe('Acme Manufacturing');
    expect(detail?.contacts.map((contact) => contact.id)).toEqual([11, 12]);
    expect(detail?.opportunities.map((opportunity) => opportunity.id)).toEqual([
      21, 22, 23,
    ]);
  });

  it('totals every stage of the customer’s opportunities, including won and lost', async () => {
    const detail = await createService().getCustomerDetail(1);
    expect(detail?.totalOpportunityAmount).toBe(160000);
  });

  it('never counts another customer’s opportunities in the total', async () => {
    const service = createService();
    const acme = await service.getCustomerDetail(1);
    const northwind = await service.getCustomerDetail(2);

    expect(acme?.totalOpportunityAmount).toBe(160000);
    expect(northwind?.totalOpportunityAmount).toBe(80000);
  });

  it('answers undefined for a customer that does not exist', async () => {
    expect(await createService().getCustomerDetail(999)).toBeUndefined();
  });

  it('reflects an amount change in the customer total without touching another customer', async () => {
    const service = createService();

    await service.updateOpportunity(21, { amount: 150000 });

    expect((await service.getCustomerDetail(1))?.totalOpportunityAmount).toBe(
      190000,
    );
    expect((await service.getCustomerDetail(2))?.totalOpportunityAmount).toBe(
      80000,
    );
  });

  it('rounds the total to cents', () => {
    expect(
      totalOpportunityAmount([
        {
          id: 1,
          name: 'a',
          customerId: 1,
          amount: 0.1,
          stage: 'following',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 2,
          name: 'b',
          customerId: 1,
          amount: 0.2,
          stage: 'following',
          createdAt: '',
          updatedAt: '',
        },
      ]),
    ).toBe(0.3);
  });

  it('filters a list by stage and by customer', async () => {
    const service = createService();

    expect(
      (await service.listOpportunities({ stage: 'following' })).map(
        (opportunity) => opportunity.id,
      ),
    ).toEqual([21, 24]);
    expect(
      (await service.listOpportunities({ customerId: 1 })).map(
        (opportunity) => opportunity.id,
      ),
    ).toEqual([21, 22, 23]);
    expect(await service.listContacts({ customerId: 2 })).toHaveLength(1);
  });
});
