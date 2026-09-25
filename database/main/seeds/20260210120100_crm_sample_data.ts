import { defineSeed } from '@nocobase/db';

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRecord {
  id: number;
  name: string;
  contactInfo: string | null;
  customerId: number;
}

interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  amount: number | string;
  stage: string;
}

/**
 * Installation data for the CRM feature.
 *
 * Each record is inserted only when its stable business identity is absent.
 * `upsertOne` is not used because these rows have no natural unique key and the
 * generated `id` is managed by the database, so it is neither a valid upsert
 * filter nor a writable value. Creating only what is missing keeps a repeated
 * run a no-op and never overwrites a change a user made to a seeded row.
 */
export default defineSeed({
  name: '20260210120100_crm_sample_data',

  async run(context) {
    const customers = context.repository<CustomerRecord>('crm_customers');
    const contacts = context.repository<ContactRecord>('crm_contacts');
    const opportunities =
      context.repository<OpportunityRecord>('crm_opportunities');

    let starSea = await customers.findOne({ filter: { name: '星海科技' } });
    if (!starSea) {
      starSea = (
        await customers.createOne({
          values: { name: '星海科技', industry: '互联网' },
        })
      ).record;
    }

    let hengyuan = await customers.findOne({ filter: { name: '恒远贸易' } });
    if (!hengyuan) {
      hengyuan = (
        await customers.createOne({
          values: { name: '恒远贸易', industry: '制造业' },
        })
      ).record;
    }

    if (
      (await contacts.findOne({
        filter: { name: '张伟', customerId: starSea.id },
      })) === undefined
    ) {
      await contacts.createOne({
        values: {
          name: '张伟',
          contactInfo: '13800000001',
          customerId: starSea.id,
        },
      });
    }
    if (
      (await contacts.findOne({
        filter: { name: '李娜', customerId: starSea.id },
      })) === undefined
    ) {
      await contacts.createOne({
        values: {
          name: '李娜',
          contactInfo: 'lina@xinghai.example.com',
          customerId: starSea.id,
        },
      });
    }
    if (
      (await contacts.findOne({
        filter: { name: '王强', customerId: hengyuan.id },
      })) === undefined
    ) {
      await contacts.createOne({
        values: {
          name: '王强',
          contactInfo: '13900000002',
          customerId: hengyuan.id,
        },
      });
    }

    if (
      (await opportunities.findOne({
        filter: { name: '企业官网改版', customerId: starSea.id },
      })) === undefined
    ) {
      await opportunities.createOne({
        values: {
          name: '企业官网改版',
          customerId: starSea.id,
          amount: 120000,
          stage: 'following',
        },
      });
    }
    if (
      (await opportunities.findOne({
        filter: { name: '年度采购合同', customerId: hengyuan.id },
      })) === undefined
    ) {
      await opportunities.createOne({
        values: {
          name: '年度采购合同',
          customerId: hengyuan.id,
          amount: 350000,
          stage: 'won',
        },
      });
    }
    if (
      (await opportunities.findOne({
        filter: { name: '智能仓储系统', customerId: hengyuan.id },
      })) === undefined
    ) {
      await opportunities.createOne({
        values: {
          name: '智能仓储系统',
          customerId: hengyuan.id,
          amount: 80000,
          stage: 'lost',
        },
      });
    }
  },
});
