import { defineSeed } from '@nocobase/db';

interface CustomerRecord {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

interface ContactRecord {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
}

interface OpportunityRecord {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: string;
}

/**
 * Starting records for the sales team: two fictional customers, three contacts
 * and three opportunities, spread over both customers so the per-customer
 * amount total has something that must not leak between them.
 *
 * Every record is matched by its fixed name (plus the owning customer for
 * contacts and opportunities) before it is inserted, so a repeat run inserts
 * nothing and never overwrites a row the user has edited.
 */
export default defineSeed({
  name: '202610020002_demo_sales_crm',

  async run(context) {
    const customers = context.repository<CustomerRecord>('customers');
    const contacts = context.repository<ContactRecord>('contacts');
    const opportunities =
      context.repository<OpportunityRecord>('opportunities');

    async function customerId(name: string, industry: string): Promise<number> {
      const existing = await customers.findOne({ filter: { name } });
      if (existing) return existing.id;
      const { record } = await customers.createOne({
        values: { name, industry },
      });
      return record.id;
    }

    async function contact(
      name: string,
      email: string,
      owningCustomerId: number,
    ): Promise<void> {
      const existing = await contacts.findOne({
        filter: { name, customerId: owningCustomerId },
      });
      if (existing) return;
      await contacts.createOne({
        values: { name, email, phone: null, customerId: owningCustomerId },
      });
    }

    async function opportunity(
      name: string,
      owningCustomerId: number,
      amount: number,
      stage: string,
    ): Promise<void> {
      const existing = await opportunities.findOne({
        filter: { name, customerId: owningCustomerId },
      });
      if (existing) return;
      await opportunities.createOne({
        values: { name, customerId: owningCustomerId, amount, stage },
      });
    }

    const acme = await customerId('Acme Manufacturing', 'Manufacturing');
    const globex = await customerId(
      'Globex Technology',
      'Information technology',
    );

    await contact('Alice Chen', 'alice.chen@acme.example', acme);
    await contact('Bob Li', 'bob.li@acme.example', acme);
    await contact('Carol Wang', 'carol.wang@globex.example', globex);

    await opportunity('Website redesign', acme, 12000, 'follow_up');
    await opportunity('Annual support renewal', acme, 5000, 'won');
    await opportunity('Cloud migration', globex, 30000, 'follow_up');
  },
});
