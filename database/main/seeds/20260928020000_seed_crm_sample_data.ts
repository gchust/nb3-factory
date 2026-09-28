import { defineSeed, type Repository, type SeedDefinition } from '@nocobase/db';

interface CustomerRow {
  id: number;
  name: string;
  industry: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OpportunityRow {
  id: number;
  name: string;
  customerId: number;
  amount: number;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Sample data for the sales team: two customers, three contacts, three
 * opportunities.
 *
 * Every insert is guarded by a lookup on the stable business key (the name,
 * scoped to its customer for the child tables). A repeated run therefore finds
 * each row already present and writes nothing, and a row the team has edited is
 * left alone — a seed installs a starting point, it does not own the data
 * afterwards.
 */
const seed: SeedDefinition = defineSeed({
  name: '20260928020000_seed_crm_sample_data',
  async run(context) {
    const customers: Repository<CustomerRow> =
      context.repository<CustomerRow>('customers');
    const contacts: Repository<ContactRow> =
      context.repository<ContactRow>('contacts');
    const opportunities: Repository<OpportunityRow> =
      context.repository<OpportunityRow>('opportunities');

    async function ensureCustomer(
      name: string,
      industry: string | null,
    ): Promise<number> {
      const existing = await customers.findOne({
        filter: { name },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        return existing.id;
      }
      const now = new Date();
      const { record } = await customers.createOne({
        values: { name, industry, createdAt: now, updatedAt: now },
      });
      return record.id;
    }

    async function ensureContact(
      customerId: number,
      values: Omit<ContactRow, 'id' | 'customerId' | 'createdAt' | 'updatedAt'>,
    ): Promise<void> {
      const existing = await contacts.findOne({
        filter: { customerId, name: values.name },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        return;
      }
      const now = new Date();
      await contacts.createOne({
        values: { ...values, customerId, createdAt: now, updatedAt: now },
      });
    }

    async function ensureOpportunity(
      customerId: number,
      values: Omit<
        OpportunityRow,
        'id' | 'customerId' | 'createdAt' | 'updatedAt'
      >,
    ): Promise<void> {
      const existing = await opportunities.findOne({
        filter: { customerId, name: values.name },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        return;
      }
      const now = new Date();
      await opportunities.createOne({
        values: { ...values, customerId, createdAt: now, updatedAt: now },
      });
    }

    const xingchen = await ensureCustomer('星辰科技', '软件服务');
    const lanhai = await ensureCustomer('蓝海制造', '装备制造');

    await ensureContact(xingchen, {
      name: '张伟',
      phone: '138-0000-1001',
      email: 'zhangwei@xingchen.example',
    });
    await ensureContact(xingchen, {
      name: '李娜',
      phone: '138-0000-1002',
      email: 'lina@xingchen.example',
    });
    await ensureContact(lanhai, {
      name: '王强',
      phone: '138-0000-2001',
      email: 'wangqiang@lanhai.example',
    });

    await ensureOpportunity(xingchen, {
      name: '企业版年度订阅',
      amount: 120000,
      stage: 'following',
    });
    await ensureOpportunity(xingchen, {
      name: '数据平台实施服务',
      amount: 80000,
      stage: 'won',
    });
    await ensureOpportunity(lanhai, {
      name: '生产线改造一期',
      amount: 50000,
      stage: 'lost',
    });
  },
});

export default seed;
