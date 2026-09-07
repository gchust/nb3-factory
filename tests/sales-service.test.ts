import { describe, expect, it } from 'vitest';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';

import {
  DefaultSalesService,
  assertInputFields,
} from '../server/providers/sales-service.js';
import {
  OPPORTUNITY_STAGES,
  SalesBusinessError,
  STAGE_WIN_PROBABILITY,
} from '../server/providers/sales-types.js';
import { createTestDatabase } from './helpers/sales-test-db.js';

const ALL_RECORDS: DatabaseAuthorizationConditions = {
  type: 'database',
  collection: 'main.customers',
  action: 'read',
  filter: { $and: [] },
  fields: { input: '*', output: '*' },
};

const OWNER_A = 'user-owner-a';
const OWNER_B = 'user-owner-b';

describe('DefaultSalesService', () => {
  it('creates a customer with a generated number and defaults', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id } = await service.createCustomer(
        { name: '示例科技', industry: '软件' },
        OWNER_A,
        ALL_RECORDS,
      );
      const customer = await service.getCustomer(id, ALL_RECORDS);
      expect(customer?.name).toBe('示例科技');
      expect(customer?.industry).toBe('软件');
      expect(customer?.status).toBe('active');
      expect(customer?.isPublic).toBeFalsy();
      expect(customer?.ownerId).toBe(OWNER_A);
      expect(String(customer?.customerNo)).toMatch(/^CUS-\d{8}-/);
      // Every customer gets a one-to-one profile row so the profile section
      // and business-license upload are available from the detail view.
      expect(customer?.profile).toMatchObject({
        customerId: id,
        address: null,
        creditLevel: null,
        notes: null,
      });
    } finally {
      await database.destroy();
    }
  });

  it('lists customers newest first and filters by status and search', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      await service.createCustomer({ name: '第一客户' }, OWNER_A, ALL_RECORDS);
      // Ensure a distinct createdAt so the newest-first ordering is deterministic.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await service.createCustomer(
        { name: '第二客户', status: 'potential' },
        OWNER_A,
        ALL_RECORDS,
      );
      const all = await service.listCustomers(ALL_RECORDS, {});
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('第二客户');

      const potential = await service.listCustomers(ALL_RECORDS, {
        status: 'potential',
      });
      expect(potential).toHaveLength(1);
      expect(potential[0].name).toBe('第二客户');

      const searched = await service.listCustomers(ALL_RECORDS, { q: '第一' });
      expect(searched).toHaveLength(1);
      expect(searched[0].name).toBe('第一客户');
    } finally {
      await database.destroy();
    }
  });

  it('applies the record filter so a user only sees records they own', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      await service.createCustomer({ name: '我的客户' }, OWNER_A, ALL_RECORDS);
      await service.createCustomer(
        { name: '别人的客户' },
        OWNER_B,
        ALL_RECORDS,
      );

      const mine: DatabaseAuthorizationConditions = {
        ...ALL_RECORDS,
        filter: { ownerId: { $eq: OWNER_A } },
      };
      const customers = await service.listCustomers(mine, {});
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('我的客户');

      const hidden = await service.getCustomer(2, mine);
      expect(hidden).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  it('rejects input fields that are not authorized', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const restricted: DatabaseAuthorizationConditions = {
        ...ALL_RECORDS,
        fields: { input: ['name', 'industry'], output: '*' },
      };
      await expect(
        service.createCustomer(
          { name: '客户', ownerId: OWNER_B },
          OWNER_A,
          restricted,
        ),
      ).rejects.toThrow(TypeError);
      expect(() =>
        assertInputFields({ name: 'ok', ownerId: OWNER_B }, ['name']),
      ).toThrow(/ownerId/);
    } finally {
      await database.destroy();
    }
  });

  it('cascades a customer owner change to contacts and open opportunities only', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.createContact(
        { name: '联系人', customerId },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: openId } = await service.createOpportunity(
        { name: '进行中商机', customerId, expectedAmount: 1000 },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: wonId } = await service.createOpportunity(
        { name: '已赢商机', customerId, expectedAmount: 1000 },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.winOpportunity(wonId, 900, '成交', ALL_RECORDS);

      await service.changeCustomerOwner(customerId, OWNER_B, ALL_RECORDS);

      const customer = await service.getCustomer(customerId, ALL_RECORDS);
      expect(customer?.ownerId).toBe(OWNER_B);
      const contacts = await service.listContacts(ALL_RECORDS, { customerId });
      expect(contacts[0].ownerId).toBe(OWNER_B);
      const open = await service.getOpportunity(openId, ALL_RECORDS);
      expect(open?.ownerId).toBe(OWNER_B);
      const won = await service.getOpportunity(wonId, ALL_RECORDS);
      expect(won?.ownerId).toBe(OWNER_A);
    } finally {
      await database.destroy();
    }
  });

  it('refuses to delete a customer that still has contacts or opportunities', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.createContact(
        { name: '联系人', customerId },
        OWNER_A,
        ALL_RECORDS,
      );
      await expect(
        service.deleteCustomer(customerId, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'CUSTOMER_HAS_CONTACTS',
      });

      const { id: emptyId } = await service.createCustomer(
        { name: '空客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.createOpportunity(
        { name: '商机', customerId: emptyId },
        OWNER_A,
        ALL_RECORDS,
      );
      await expect(
        service.deleteCustomer(emptyId, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'CUSTOMER_HAS_OPPORTUNITIES',
      });

      const { id: deletableId } = await service.createCustomer(
        { name: '可删客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      await expect(
        service.deleteCustomer(deletableId, ALL_RECORDS),
      ).resolves.toBe(true);
    } finally {
      await database.destroy();
    }
  });

  it('converts a lead into customer, contact and opportunity exactly once', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: leadId } = await service.createLead(
        {
          companyName: '线索公司',
          contactName: '线索联系人',
          phone: '13800000000',
          email: 'lead@example.test',
        },
        OWNER_A,
        ALL_RECORDS,
      );
      // A lead created without an explicit owner belongs to its creator,
      // so the sales role can see and manage it.
      const created = await service.listLeads(ALL_RECORDS, {});
      expect(created[0].ownerId).toBe(OWNER_A);
      await service.assignLead(leadId, OWNER_A, ALL_RECORDS);

      const first = await service.convertLead(leadId, OWNER_A, ALL_RECORDS);
      expect(first.alreadyConverted).toBe(false);

      const customers = await service.listCustomers(ALL_RECORDS, {});
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('线索公司');
      expect(customers[0].ownerId).toBe(OWNER_A);

      // The converted customer also gets its one-to-one profile row.
      const converted = await service.getCustomer(
        first.customerId,
        ALL_RECORDS,
      );
      expect(converted?.profile?.customerId).toBe(first.customerId);

      const contacts = await service.listContacts(ALL_RECORDS, {});
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe('线索联系人');
      expect(contacts[0].customerId).toBe(first.customerId);

      const opportunities = await service.listOpportunities(ALL_RECORDS, {});
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].name).toBe('线索公司商机');
      expect(opportunities[0].stage).toBe(OPPORTUNITY_STAGES.NEW);
      expect(opportunities[0].winProbability).toBe(
        STAGE_WIN_PROBABILITY[OPPORTUNITY_STAGES.NEW],
      );

      const lead = (await service.listLeads(ALL_RECORDS, {}))[0];
      expect(lead.status).toBe('converted');
      expect(Number(lead.convertedCustomerId)).toBe(first.customerId);

      // A repeated conversion is a no-op returning the same customer.
      const second = await service.convertLead(leadId, OWNER_A, ALL_RECORDS);
      expect(second).toEqual({
        customerId: first.customerId,
        alreadyConverted: true,
      });
      expect(await service.listCustomers(ALL_RECORDS, {})).toHaveLength(1);
    } finally {
      await database.destroy();
    }
  });

  it('refuses to delete a converted lead', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: leadId } = await service.createLead(
        { companyName: '线索公司' },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.convertLead(leadId, OWNER_A, ALL_RECORDS);
      await expect(
        service.deleteLead(leadId, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'LEAD_CONVERTED',
      });
    } finally {
      await database.destroy();
    }
  });

  it('advances an opportunity stage and recomputes probability and weighted amount', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: opportunityId } = await service.createOpportunity(
        { name: '商机', customerId, expectedAmount: 100000 },
        OWNER_A,
        ALL_RECORDS,
      );

      const created = await service.getOpportunity(opportunityId, ALL_RECORDS);
      expect(created?.stage).toBe(OPPORTUNITY_STAGES.NEW);
      expect(created?.winProbability).toBe(10);
      expect(Number(created?.weightedAmount)).toBe(10000);

      const advanced = await service.advanceOpportunity(
        opportunityId,
        ALL_RECORDS,
      );
      expect(advanced.stage).toBe(OPPORTUNITY_STAGES.NEEDS_CONFIRMATION);
      expect(advanced.winProbability).toBe(30);
      expect(Number(advanced.weightedAmount)).toBe(30000);

      await service.advanceOpportunity(opportunityId, ALL_RECORDS);
      const quoted = await service.advanceOpportunity(
        opportunityId,
        ALL_RECORDS,
      );
      expect(quoted.stage).toBe(OPPORTUNITY_STAGES.NEGOTIATION);
      expect(quoted.winProbability).toBe(80);
      expect(Number(quoted.weightedAmount)).toBe(80000);

      // Negotiation cannot be advanced further; won/lost are terminal outcomes.
      await expect(
        service.advanceOpportunity(opportunityId, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'STAGE_NOT_ADVANCEABLE',
      });
    } finally {
      await database.destroy();
    }
  });

  it('wins an opportunity only with a positive actual amount', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: opportunityId } = await service.createOpportunity(
        { name: '商机', customerId, expectedAmount: 100000 },
        OWNER_A,
        ALL_RECORDS,
      );

      await expect(
        service.winOpportunity(opportunityId, 0, '无金额', ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'WIN_REQUIRES_AMOUNT',
      });

      const won = await service.winOpportunity(
        opportunityId,
        120000,
        '客户认可',
        ALL_RECORDS,
      );
      expect(won.stage).toBe(OPPORTUNITY_STAGES.WON);
      expect(won.winProbability).toBe(100);
      expect(Number(won.actualAmount)).toBe(120000);
      expect(won.resultReason).toBe('客户认可');

      // A terminal opportunity cannot be won again.
      await expect(
        service.winOpportunity(opportunityId, 1, 'again', ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'STAGE_TERMINAL',
      });
    } finally {
      await database.destroy();
    }
  });

  it('loses an opportunity only with a reason and archives terminal ones', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: opportunityId } = await service.createOpportunity(
        { name: '商机', customerId, expectedAmount: 100000 },
        OWNER_A,
        ALL_RECORDS,
      );

      await expect(
        service.loseOpportunity(opportunityId, '  ', ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'LOSE_REQUIRES_REASON',
      });

      const lost = await service.loseOpportunity(
        opportunityId,
        '预算不足',
        ALL_RECORDS,
      );
      expect(lost.stage).toBe(OPPORTUNITY_STAGES.LOST);
      expect(lost.winProbability).toBe(0);
      expect(Number(lost.weightedAmount)).toBe(0);
      expect(lost.resultReason).toBe('预算不足');

      // Archived opportunities disappear from the active pipeline.
      await expect(
        service.archiveOpportunity(opportunityId, ALL_RECORDS),
      ).resolves.toBe(true);
      const active = await service.listOpportunities(ALL_RECORDS, {});
      expect(active).toHaveLength(0);
      const withArchived = await service.listOpportunities(ALL_RECORDS, {
        includeArchived: true,
      });
      expect(withArchived).toHaveLength(1);
    } finally {
      await database.destroy();
    }
  });

  it('rejects opportunity contacts that do not belong to the customer', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerA } = await service.createCustomer(
        { name: '客户A' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: customerB } = await service.createCustomer(
        { name: '客户B' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: contactA } = await service.createContact(
        { name: '联系人A', customerId: customerA },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: opportunityId } = await service.createOpportunity(
        { name: '商机', customerId: customerA },
        OWNER_A,
        ALL_RECORDS,
      );
      await expect(
        service.updateOpportunity(
          opportunityId,
          {},
          [contactA, 999],
          ALL_RECORDS,
        ),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'CONTACT_NOT_IN_CUSTOMER',
      });
      void customerB;
    } finally {
      await database.destroy();
    }
  });

  it('computes dashboard statistics including win rate and overdue follow-ups', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: openId } = await service.createOpportunity(
        { name: '进行中', customerId, expectedAmount: 100000 },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: wonId } = await service.createOpportunity(
        { name: '已赢', customerId, expectedAmount: 50000 },
        OWNER_A,
        ALL_RECORDS,
      );
      const { id: lostId } = await service.createOpportunity(
        { name: '已输', customerId, expectedAmount: 20000 },
        OWNER_A,
        ALL_RECORDS,
      );
      await service.winOpportunity(wonId, 45000, '成交', ALL_RECORDS);
      await service.loseOpportunity(lostId, '价格高', ALL_RECORDS);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await service.createFollowUp(
        {
          subject: '逾期跟进',
          customerId,
          opportunityId: openId,
          followUpAt: yesterday,
          nextFollowUpAt: yesterday,
        },
        OWNER_A,
        ALL_RECORDS,
      );

      const stats = await service.getDashboard(ALL_RECORDS, ALL_RECORDS);
      expect(stats.opportunityCount).toBe(3);
      expect(stats.wonCount).toBe(1);
      expect(stats.lostCount).toBe(1);
      expect(stats.winRate).toBe(0.5);
      expect(stats.expectedAmount).toBe(170000);
      // 100000*0.1 + 50000*1 + 20000*0
      expect(stats.weightedAmount).toBe(60000);
      expect(stats.overdueFollowUpCount).toBe(1);
      const byStage = Object.fromEntries(
        stats.stageDistribution.map((row) => [row.stage, row.count]),
      );
      expect(byStage).toMatchObject({
        new: 1,
        won: 1,
        lost: 1,
      });
      expect(stats.perOwner).toEqual([
        { ownerId: OWNER_A, count: 3, expectedAmount: 170000 },
      ]);
    } finally {
      await database.destroy();
    }
  });

  it('requires a follow-up time when creating a follow-up', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      await expect(
        service.createFollowUp({ subject: '无时间' }, OWNER_A, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'FOLLOW_UP_REQUIRES_TIME',
      });
    } finally {
      await database.destroy();
    }
  });

  it('rejects a follow-up whose next time is earlier than the follow-up time', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const followUpAt = new Date('2026-09-08T10:00:00Z');
      const nextFollowUpAt = new Date('2026-09-07T10:00:00Z');
      await expect(
        service.createFollowUp(
          {
            subject: '非法时间',
            followUpAt,
            nextFollowUpAt,
          },
          OWNER_A,
          ALL_RECORDS,
        ),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'FOLLOW_UP_NEXT_BEFORE_CURRENT',
      });
    } finally {
      await database.destroy();
    }
  });

  it('accepts a follow-up whose next time equals the follow-up time', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const followUpAt = new Date('2026-09-08T10:00:00Z');
      const { id } = await service.createFollowUp(
        {
          subject: '同日跟进',
          followUpAt,
          nextFollowUpAt: followUpAt,
        },
        OWNER_A,
        ALL_RECORDS,
      );
      expect(id).toBeGreaterThan(0);
    } finally {
      await database.destroy();
    }
  });

  it('rejects an update that makes the next time earlier than the follow-up time', async () => {
    const { database } = await createTestDatabase({
      users: [OWNER_A, OWNER_B],
    });
    try {
      const service = new DefaultSalesService(database);
      const { id } = await service.createFollowUp(
        {
          subject: '待修改',
          followUpAt: new Date('2026-09-08T10:00:00Z'),
          nextFollowUpAt: new Date('2026-09-10T10:00:00Z'),
        },
        OWNER_A,
        ALL_RECORDS,
      );
      // Only the next time is sent; the rule must still compare against the
      // stored follow-up time.
      await expect(
        service.updateFollowUp(
          id,
          { nextFollowUpAt: new Date('2026-09-07T10:00:00Z') },
          ALL_RECORDS,
        ),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'FOLLOW_UP_NEXT_BEFORE_CURRENT',
      });
      // And the reverse: moving the follow-up time past the stored next time.
      await expect(
        service.updateFollowUp(
          id,
          { followUpAt: new Date('2026-09-11T10:00:00Z') },
          ALL_RECORDS,
        ),
      ).rejects.toMatchObject({
        name: 'SalesBusinessError',
        code: 'FOLLOW_UP_NEXT_BEFORE_CURRENT',
      });
    } finally {
      await database.destroy();
    }
  });

  it('throws typed business errors with an HTTP status', () => {
    const error = new SalesBusinessError('SOME_CODE', '消息', 403);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SalesBusinessError');
    expect(error.code).toBe('SOME_CODE');
    expect(error.status).toBe(403);
  });
});
