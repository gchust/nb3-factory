// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import {
  CrmValidationError,
  createCrmService,
} from '../../server/providers/crm.js';
import {
  createSeededDatabase,
  type CrmTestDatabase,
} from '../fixtures/crm-database.js';

const openDatabases: CrmTestDatabase[] = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.dispose();
  }
});

async function seededService() {
  const database = await createSeededDatabase();
  openDatabases.push(database);
  return {
    database,
    service: createCrmService(database.manager),
  };
}

describe('CRM service', () => {
  it('rejects a customer without a name', async () => {
    const { service } = await seededService();
    await expect(
      service.createCustomer({ industry: 'Retail' }),
    ).rejects.toBeInstanceOf(CrmValidationError);
    await expect(service.createCustomer({ name: '   ' })).rejects.toMatchObject(
      {
        fields: { name: 'REQUIRED' },
      },
    );
  });

  it('refuses a contact for a customer that does not exist', async () => {
    const { service } = await seededService();
    await expect(
      service.createContact({ name: 'Nobody', customerId: 99999 }),
    ).rejects.toMatchObject({ fields: { customerId: 'NOT_FOUND' } });
  });

  it('refuses a negative amount', async () => {
    const { service } = await seededService();
    const [customer] = await service.listCustomers();
    await expect(
      service.createOpportunity({
        name: 'Refund',
        customerId: customer.id,
        amount: -1,
      }),
    ).rejects.toMatchObject({ fields: { amount: 'INVALID' } });
  });

  it('refuses a non-numeric amount and an unknown stage', async () => {
    const { service } = await seededService();
    const [customer] = await service.listCustomers();
    await expect(
      service.createOpportunity({
        name: 'Bad amount',
        customerId: customer.id,
        amount: 'not a number',
      }),
    ).rejects.toMatchObject({ fields: { amount: 'INVALID' } });
    await expect(
      service.createOpportunity({
        name: 'Bad stage',
        customerId: customer.id,
        amount: 10,
        stage: 'almost',
      }),
    ).rejects.toMatchObject({ fields: { stage: 'INVALID' } });
  });

  it('rounds an amount to cents', async () => {
    const { service } = await seededService();
    const [customer] = await service.listCustomers();
    const created = await service.createOpportunity({
      name: 'Rounded',
      customerId: customer.id,
      amount: 10.005,
    });
    expect(created.amount).toBe(10.01);
  });

  it('totals only the opportunities of the requested customer', async () => {
    const { service } = await seededService();
    const customers = await service.listCustomers();
    const acme = customers.find(
      (customer) => customer.name === 'Acme Manufacturing',
    );
    const northwind = customers.find(
      (customer) => customer.name === 'Northwind Trading',
    );
    expect(acme).toBeDefined();
    expect(northwind).toBeDefined();

    const acmeSummary = await service.getCustomerSummary(acme!.id);
    const northwindSummary = await service.getCustomerSummary(northwind!.id);

    expect(acmeSummary?.contacts.map((contact) => contact.name)).toEqual([
      'Alice Chen',
      'David Park',
    ]);
    expect(acmeSummary?.opportunityCount).toBe(2);
    expect(acmeSummary?.opportunityTotal).toBe(205000);
    expect(northwindSummary?.opportunityCount).toBe(1);
    expect(northwindSummary?.opportunityTotal).toBe(45000);
  });

  it('moves the total when an amount changes, without touching another customer', async () => {
    const { service } = await seededService();
    const customers = await service.listCustomers();
    const acme = customers.find(
      (customer) => customer.name === 'Acme Manufacturing',
    )!;
    const northwind = customers.find(
      (customer) => customer.name === 'Northwind Trading',
    )!;
    const acmeSummary = await service.getCustomerSummary(acme.id);
    const planned = acmeSummary!.opportunities.find(
      (opportunity) => opportunity.name === 'Annual supply contract',
    )!;

    await service.updateOpportunity(planned.id, { amount: 100000 });

    expect((await service.getCustomerSummary(acme.id))?.opportunityTotal).toBe(
      185000,
    );
    expect(
      (await service.getCustomerSummary(northwind.id))?.opportunityTotal,
    ).toBe(45000);
  });

  it('filters opportunities by stage', async () => {
    const { service } = await seededService();
    const won = await service.listOpportunities({ stage: 'won' });
    expect(won.map((opportunity) => opportunity.name)).toEqual([
      'Packaging line upgrade',
    ]);
    expect(await service.listOpportunities()).toHaveLength(3);
  });
});
