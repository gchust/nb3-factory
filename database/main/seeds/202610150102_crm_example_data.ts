import { hashPassword } from 'better-auth/crypto';
import { defineSeed } from '@nocobase/db';

/**
 * Example data for the CRM: three team accounts and a small book of business
 * spread across them, so the own-versus-team record scoping and the assistant
 * are visible right after installation.
 *
 * This is installation data, written once. The seed is idempotent: it creates
 * only what is missing and never overwrites or restores rows a user removed.
 */

/** Shared password for the three example accounts. */
const DEMO_PASSWORD = 'Demo123456';

interface DemoUser {
  username: string;
  name: string;
  email: string;
  set: 'crm-sales-manager' | 'crm-sales';
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'crm.manager',
    name: 'Morgan Chen (Sales Supervisor)',
    email: 'manager@example.com',
    set: 'crm-sales-manager',
  },
  {
    username: 'crm.sales1',
    name: 'Alex Li (Sales)',
    email: 'sales1@example.com',
    set: 'crm-sales',
  },
  {
    username: 'crm.sales2',
    name: 'Bella Wang (Sales)',
    email: 'sales2@example.com',
    set: 'crm-sales',
  },
];

export default defineSeed({
  name: '202610150102_crm_example_data',
  async run({ query }) {
    const now = new Date();
    const iso = (date: Date) => date.toISOString();
    const daysFromNow = (days: number) => {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      return date;
    };
    const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

    const owners = new Map<string, string>();

    for (const demo of DEMO_USERS) {
      let user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', demo.username)
        .limit(1)
        .executeTakeFirst();

      if (!user) {
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(DEMO_PASSWORD);
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: demo.name,
            username: demo.username,
            email: demo.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        user = { id: userId };
      }

      const userId = String(user.id);
      owners.set(demo.username, userId);

      const assignmentId = `user:${userId}:${demo.set}`;
      const assignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .limit(1)
        .executeTakeFirst();
      if (!assignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: demo.set,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    const sales1 = owners.get('crm.sales1')!;
    const sales2 = owners.get('crm.sales2')!;

    // The book of business is installed once, as a unit. Its first customer is
    // the marker: if that exists the example data was already written.
    const marker = await query
      .selectFrom('crmCustomers')
      .select('id')
      .where('name', '=', 'Hanwei Robotics')
      .limit(1)
      .executeTakeFirst();
    if (marker) {
      return;
    }

    interface CustomerSeed {
      name: string;
      ownerId: string;
      industry: string;
      level: 'A' | 'B' | 'C';
      phone: string;
      email: string;
      source: string;
      notes: string;
    }

    const customers: readonly CustomerSeed[] = [
      {
        name: 'Hanwei Robotics',
        ownerId: sales1,
        industry: 'Manufacturing',
        level: 'A',
        phone: '+86-21-5555-0101',
        email: 'contact@hanwei.example.com',
        source: 'Referral',
        notes: 'Evaluating an automated line upgrade in Q4.',
      },
      {
        name: 'Qingyun Retail Group',
        ownerId: sales1,
        industry: 'Retail',
        level: 'B',
        phone: '+86-10-5555-0202',
        email: 'buying@qingyun.example.com',
        source: 'Trade show',
        notes: 'Multi-store rollout, price sensitive.',
      },
      {
        name: 'Beihai Logistics',
        ownerId: sales1,
        industry: 'Logistics',
        level: 'C',
        phone: '+86-532-5555-0303',
        email: 'it@beihai.example.com',
        source: 'Website',
        notes: 'Early research stage.',
      },
      {
        name: 'Yulan Biotech',
        ownerId: sales2,
        industry: 'Life sciences',
        level: 'A',
        phone: '+86-755-5555-0404',
        email: 'procurement@yulan.example.com',
        source: 'Partner',
        notes: 'Compliance review is the next gate.',
      },
      {
        name: 'Tianhe Education',
        ownerId: sales2,
        industry: 'Education',
        level: 'B',
        phone: '+86-28-5555-0505',
        email: 'admin@tianhe.example.com',
        source: 'Cold call',
        notes: 'Wants a pilot for two campuses.',
      },
      {
        name: 'Shanshui Hospitality',
        ownerId: sales2,
        industry: 'Hospitality',
        level: 'C',
        phone: '+86-571-5555-0606',
        email: 'gm@shanshui.example.com',
        source: 'Referral',
        notes: 'Seasonal budget, revisit next quarter.',
      },
    ];

    const customerIds = new Map<string, number>();
    for (const customer of customers) {
      await query
        .insertInto('crmCustomers')
        .values({
          name: customer.name,
          ownerId: customer.ownerId,
          industry: customer.industry,
          level: customer.level,
          phone: customer.phone,
          email: customer.email,
          website: null,
          address: null,
          source: customer.source,
          notes: customer.notes,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const row = await query
        .selectFrom('crmCustomers')
        .select('id')
        .where('name', '=', customer.name)
        .limit(1)
        .executeTakeFirstOrThrow();
      customerIds.set(customer.name, Number(row.id));
    }

    const contacts: readonly {
      customer: string;
      name: string;
      position: string;
      phone: string;
      email: string;
      isPrimary: boolean;
    }[] = [
      {
        customer: 'Hanwei Robotics',
        name: 'Zhang Wei',
        position: 'Procurement Director',
        phone: '+86-138-0000-0001',
        email: 'zhang.wei@hanwei.example.com',
        isPrimary: true,
      },
      {
        customer: 'Hanwei Robotics',
        name: 'Liu Fang',
        position: 'Production Engineer',
        phone: '+86-138-0000-0002',
        email: 'liu.fang@hanwei.example.com',
        isPrimary: false,
      },
      {
        customer: 'Qingyun Retail Group',
        name: 'Chen Hao',
        position: 'Head of Operations',
        phone: '+86-138-0000-0003',
        email: 'chen.hao@qingyun.example.com',
        isPrimary: true,
      },
      {
        customer: 'Yulan Biotech',
        name: 'Sun Lei',
        position: 'Head of Procurement',
        phone: '+86-138-0000-0004',
        email: 'sun.lei@yulan.example.com',
        isPrimary: true,
      },
      {
        customer: 'Tianhe Education',
        name: 'Zhao Min',
        position: 'IT Manager',
        phone: '+86-138-0000-0005',
        email: 'zhao.min@tianhe.example.com',
        isPrimary: true,
      },
    ];

    for (const contact of contacts) {
      const customerId = customerIds.get(contact.customer)!;
      await query
        .insertInto('crmContacts')
        .values({
          customerId,
          ownerId: customers.find((item) => item.name === contact.customer)!
            .ownerId,
          name: contact.name,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
          isPrimary: contact.isPrimary,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    interface OpportunitySeed {
      customer: string;
      name: string;
      stage: 'initial_contact' | 'quote' | 'won' | 'lost';
      amount: number;
      expectedCloseDate: string;
      lostReason: string | null;
    }

    const opportunities: readonly OpportunitySeed[] = [
      {
        customer: 'Hanwei Robotics',
        name: 'Automated line upgrade - phase 1',
        stage: 'quote',
        amount: 480000,
        expectedCloseDate: dateOnly(daysFromNow(21)),
        lostReason: null,
      },
      {
        customer: 'Hanwei Robotics',
        name: 'Spare parts annual contract',
        stage: 'won',
        amount: 60000,
        expectedCloseDate: dateOnly(daysFromNow(-10)),
        lostReason: null,
      },
      {
        customer: 'Qingyun Retail Group',
        name: 'Store rollout - 12 sites',
        stage: 'initial_contact',
        amount: 260000,
        expectedCloseDate: dateOnly(daysFromNow(45)),
        lostReason: null,
      },
      {
        customer: 'Beihai Logistics',
        name: 'Fleet tracking pilot',
        stage: 'lost',
        amount: 90000,
        expectedCloseDate: dateOnly(daysFromNow(-30)),
        lostReason: 'Budget moved to next fiscal year.',
      },
      {
        customer: 'Yulan Biotech',
        name: 'Lab compliance package',
        stage: 'quote',
        amount: 720000,
        expectedCloseDate: dateOnly(daysFromNow(14)),
        lostReason: null,
      },
      {
        customer: 'Yulan Biotech',
        name: 'Training services',
        stage: 'initial_contact',
        amount: 45000,
        expectedCloseDate: dateOnly(daysFromNow(60)),
        lostReason: null,
      },
      {
        customer: 'Tianhe Education',
        name: 'Two-campus pilot',
        stage: 'won',
        amount: 150000,
        expectedCloseDate: dateOnly(daysFromNow(-5)),
        lostReason: null,
      },
      {
        customer: 'Shanshui Hospitality',
        name: 'Seasonal maintenance',
        stage: 'lost',
        amount: 30000,
        expectedCloseDate: dateOnly(daysFromNow(-60)),
        lostReason: 'Chose a local provider.',
      },
    ];

    const opportunityIds = new Map<string, number>();
    for (const opportunity of opportunities) {
      const customerId = customerIds.get(opportunity.customer)!;
      const ownerId = customers.find(
        (item) => item.name === opportunity.customer,
      )!.ownerId;
      await query
        .insertInto('crmOpportunities')
        .values({
          customerId,
          ownerId,
          name: opportunity.name,
          stage: opportunity.stage,
          amount: opportunity.amount,
          expectedCloseDate: opportunity.expectedCloseDate,
          lostReason: opportunity.lostReason,
          notes: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const row = await query
        .selectFrom('crmOpportunities')
        .select('id')
        .where('name', '=', opportunity.name)
        .limit(1)
        .executeTakeFirstOrThrow();
      opportunityIds.set(opportunity.name, Number(row.id));
    }

    interface FollowUpSeed {
      customer: string;
      opportunity: string | null;
      method: 'call' | 'visit' | 'email' | 'wechat' | 'other';
      content: string;
      status: 'pending' | 'done' | 'cancelled';
      dueAt: Date;
    }

    const followUps: readonly FollowUpSeed[] = [
      {
        customer: 'Hanwei Robotics',
        opportunity: 'Automated line upgrade - phase 1',
        method: 'visit',
        content: 'Walk the line with the production team.',
        status: 'pending',
        dueAt: daysFromNow(-3),
      },
      {
        customer: 'Hanwei Robotics',
        opportunity: null,
        method: 'call',
        content: 'Confirm spare-parts delivery schedule.',
        status: 'done',
        dueAt: daysFromNow(-8),
      },
      {
        customer: 'Qingyun Retail Group',
        opportunity: 'Store rollout - 12 sites',
        method: 'email',
        content: 'Send the revised pricing sheet.',
        status: 'pending',
        dueAt: daysFromNow(1),
      },
      {
        customer: 'Yulan Biotech',
        opportunity: 'Lab compliance package',
        method: 'call',
        content: 'Review the compliance checklist with procurement.',
        status: 'pending',
        dueAt: daysFromNow(2),
      },
      {
        customer: 'Yulan Biotech',
        opportunity: null,
        method: 'wechat',
        content: 'Share the training calendar.',
        status: 'pending',
        dueAt: daysFromNow(-1),
      },
      {
        customer: 'Tianhe Education',
        opportunity: 'Two-campus pilot',
        method: 'visit',
        content: 'Kick-off meeting on campus.',
        status: 'done',
        dueAt: daysFromNow(-4),
      },
      {
        customer: 'Shanshui Hospitality',
        opportunity: null,
        method: 'call',
        content: 'Ask about the next budget window.',
        status: 'cancelled',
        dueAt: daysFromNow(3),
      },
    ];

    for (const followUp of followUps) {
      const customerId = customerIds.get(followUp.customer)!;
      const ownerId = customers.find(
        (item) => item.name === followUp.customer,
      )!.ownerId;
      await query
        .insertInto('crmFollowUps')
        .values({
          customerId,
          opportunityId: followUp.opportunity
            ? opportunityIds.get(followUp.opportunity)!
            : null,
          ownerId,
          method: followUp.method,
          content: followUp.content,
          status: followUp.status,
          dueAt: iso(followUp.dueAt),
          completedAt: followUp.status === 'done' ? iso(followUp.dueAt) : null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // A supervisor's inbox starts with two pending proposals, so the confirm
    // step is reachable without generating them first.
    const overdueFollowUp = await query
      .selectFrom('crmFollowUps')
      .select('id')
      .where('content', '=', 'Walk the line with the production team.')
      .limit(1)
      .executeTakeFirstOrThrow();

    const suggestions: readonly {
      customer: string;
      opportunity: string | null;
      followUpId: number | null;
      kind:
        | 'overdue_followup'
        | 'stalled_opportunity'
        | 'high_value_opportunity'
        | 'idle_customer';
      title: string;
      detail: string;
    }[] = [
      {
        customer: 'Hanwei Robotics',
        opportunity: null,
        followUpId: Number(overdueFollowUp.id),
        kind: 'overdue_followup',
        title: 'Overdue follow-up: Hanwei Robotics',
        detail:
          '“Walk the line with the production team.” was due 3 days ago. Reschedule it or mark it done.',
      },
      {
        customer: 'Yulan Biotech',
        opportunity: 'Lab compliance package',
        followUpId: null,
        kind: 'high_value_opportunity',
        title: 'High-value opportunity: Lab compliance package',
        detail:
          'Expected amount 720,000 is the largest open deal. Confirm the compliance review date before it slips.',
      },
    ];

    for (const suggestion of suggestions) {
      await query
        .insertInto('crmSuggestions')
        .values({
          customerId: customerIds.get(suggestion.customer)!,
          opportunityId: suggestion.opportunity
            ? opportunityIds.get(suggestion.opportunity)!
            : null,
          followUpId: suggestion.followUpId,
          kind: suggestion.kind,
          title: suggestion.title,
          detail: suggestion.detail,
          status: 'pending',
          decidedById: null,
          decidedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
