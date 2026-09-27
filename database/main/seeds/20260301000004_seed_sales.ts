import { defineSeed } from '@nocobase/db';

interface SeedContact {
  readonly name: string;
  readonly contactInfo: string;
}

interface SeedOpportunity {
  readonly name: string;
  readonly amount: number;
  readonly stage: 'in-progress' | 'won' | 'lost';
}

interface SeedCustomer {
  readonly name: string;
  readonly industry: string;
  readonly contacts: readonly SeedContact[];
  readonly opportunities: readonly SeedOpportunity[];
}

/**
 * The smallest useful starting set: two customers, three contacts and three
 * opportunities across the three stages.
 *
 * Every record is looked up by a stable business key — a customer by `name`, a
 * contact or opportunity by `(customerId, name)` — and only inserted when
 * missing. A repeated run is therefore a no-op, and because nothing is updated
 * an existing row a user has since edited is never overwritten.
 */
const CUSTOMERS: readonly SeedCustomer[] = [
  {
    name: 'Northwind Traders',
    industry: 'Wholesale',
    contacts: [
      {
        name: 'Alice Johnson',
        contactInfo: 'alice@northwind.example / +1 555 0100',
      },
      { name: 'Bob Martinez', contactInfo: 'bob@northwind.example' },
    ],
    opportunities: [
      { name: 'Q3 supply contract', amount: 48000, stage: 'in-progress' },
      { name: 'Warehouse expansion', amount: 12000, stage: 'won' },
    ],
  },
  {
    name: 'Blue Harbor Logistics',
    industry: 'Logistics',
    contacts: [{ name: 'Carol Chen', contactInfo: 'carol@blueharbor.example' }],
    opportunities: [
      { name: 'Fleet tracking pilot', amount: 9500, stage: 'lost' },
    ],
  },
];

export default defineSeed({
  name: '20260301000004_seed_sales',

  async run(context) {
    // `SeedContext.repository` is declared without `this: void`, so destructuring it is rejected by
    // `@typescript-eslint/unbound-method`; binding the receiver is the sanctioned spelling.
    const repository = context.repository.bind(context);
    const customers = repository('customers');
    const contacts = repository('contacts');
    const opportunities = repository('opportunities');

    for (const fixture of CUSTOMERS) {
      const existingCustomer = (await customers.findOne({
        filter: { name: fixture.name },
      })) as { readonly id: number } | undefined;

      const customer =
        existingCustomer ??
        (
          (await customers.createOne({
            values: {
              name: fixture.name,
              industry: fixture.industry,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })) as unknown as { readonly record: { readonly id: number } }
        ).record;

      for (const contact of fixture.contacts) {
        const existingContact = await contacts.findOne({
          filter: { customerId: customer.id, name: contact.name },
        });
        if (!existingContact) {
          await contacts.createOne({
            values: {
              name: contact.name,
              contactInfo: contact.contactInfo,
              customerId: customer.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }

      for (const opportunity of fixture.opportunities) {
        const existingOpportunity = await opportunities.findOne({
          filter: { customerId: customer.id, name: opportunity.name },
        });
        if (!existingOpportunity) {
          await opportunities.createOne({
            values: {
              name: opportunity.name,
              customerId: customer.id,
              amount: opportunity.amount,
              stage: opportunity.stage,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  },
});
