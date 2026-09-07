import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Sample sales data so the application is usable on first sign-in: customers
 * (some public for the visitor directory), contacts, leads, opportunities in
 * every pipeline stage (including won/lost so the dashboard win rate is
 * meaningful) and follow-ups (including one overdue so the daily reminder
 * workflow has something to act on).
 *
 * The seed is idempotent: every record carries a deterministic sample number
 * and is skipped when a row with that number already exists, so re-running
 * the seed never duplicates data.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609070002_seed_sales_sample_data',
  async run({ query }) {
    const now = new Date();

    const salesA = await userIdByEmail(query, 'sales.a@example.test');
    const salesB = await userIdByEmail(query, 'sales.b@example.test');
    if (!salesA || !salesB) {
      throw new Error(
        'Sample data seed requires the preset sales accounts (run the roles seed first).',
      );
    }

    const customerIds = new Map<string, number>();
    const contactIds = new Map<string, number>();
    const opportunityIds = new Map<string, number>();

    // --- Customers (with one-to-one profiles) -----------------------------

    const customers: ReadonlyArray<{
      no: string;
      name: string;
      industry: string;
      size: string;
      status: string;
      phone: string;
      isPublic: boolean;
      ownerId: string;
      address: string;
      creditLevel: string | null;
      notes: string;
      createdAt: Date;
    }> = [
      {
        no: 'CUS-SAMPLE-0001',
        name: '星辰科技有限公司',
        industry: '软件',
        size: 'large',
        status: 'active',
        phone: '010-88886666',
        isPublic: true,
        ownerId: salesA,
        address: '北京市海淀区中关村大街 1 号',
        creditLevel: 'A',
        notes: '重点客户，ERP 项目正在商务谈判阶段。',
        createdAt: daysAgo(now, 40),
      },
      {
        no: 'CUS-SAMPLE-0002',
        name: '蓝海贸易有限公司',
        industry: '贸易',
        size: 'medium',
        status: 'active',
        phone: '021-66668888',
        isPublic: true,
        ownerId: salesB,
        address: '上海市浦东新区世纪大道 100 号',
        creditLevel: 'B',
        notes: '供应链系统方案已报价，等待客户反馈。',
        createdAt: daysAgo(now, 35),
      },
      {
        no: 'CUS-SAMPLE-0003',
        name: '云帆教育集团',
        industry: '教育',
        size: 'medium',
        status: 'potential',
        phone: '020-33335555',
        isPublic: false,
        ownerId: salesA,
        address: '广州市天河区体育西路 88 号',
        creditLevel: null,
        notes: '在线教学平台需求确认中。',
        createdAt: daysAgo(now, 28),
      },
      {
        no: 'CUS-SAMPLE-0004',
        name: '恒信制造有限公司',
        industry: '制造',
        size: 'large',
        status: 'active',
        phone: '0512-66669999',
        isPublic: false,
        ownerId: salesB,
        address: '苏州市工业园区星湖街 218 号',
        creditLevel: 'A',
        notes: 'MES 项目刚立项，预算充足。',
        createdAt: daysAgo(now, 21),
      },
      {
        no: 'CUS-SAMPLE-0005',
        name: '绿源食品有限公司',
        industry: '食品',
        size: 'small',
        status: 'inactive',
        phone: '0571-88889999',
        isPublic: true,
        ownerId: salesA,
        address: '杭州市西湖区文三路 90 号',
        creditLevel: 'C',
        notes: '追溯系统已交付，客户暂时无新需求。',
        createdAt: daysAgo(now, 60),
      },
    ];

    for (const customer of customers) {
      const existing = await query
        .selectFrom('customers')
        .select('id')
        .where('customerNo', '=', customer.no)
        .executeTakeFirst();
      if (existing) {
        customerIds.set(customer.no, Number(existing.id));
        continue;
      }
      const inserted = await query
        .insertInto('customers')
        .values({
          customerNo: customer.no,
          name: customer.name,
          industry: customer.industry,
          size: customer.size,
          status: customer.status,
          phone: customer.phone,
          isPublic: customer.isPublic,
          ownerId: customer.ownerId,
          createdAt: customer.createdAt,
          updatedAt: customer.createdAt,
        })
        .execute();
      const customerId = Number(inserted.insertId);
      customerIds.set(customer.no, customerId);
      await query
        .insertInto('customerProfiles')
        .values({
          customerId,
          address: customer.address,
          creditLevel: customer.creditLevel,
          notes: customer.notes,
          createdAt: customer.createdAt,
          updatedAt: customer.createdAt,
        })
        .execute();
    }

    // --- Contacts ----------------------------------------------------------

    const contacts: ReadonlyArray<{
      key: string;
      name: string;
      phone: string;
      email: string;
      position: string;
      customerNo: string;
      ownerId: string;
      createdAt: Date;
    }> = [
      {
        key: 'contact-zhang-wei',
        name: '张伟',
        phone: '13800000001',
        email: 'zhangwei@xingchen.example',
        position: '采购总监',
        customerNo: 'CUS-SAMPLE-0001',
        ownerId: salesA,
        createdAt: daysAgo(now, 40),
      },
      {
        key: 'contact-li-na',
        name: '李娜',
        phone: '13800000002',
        email: 'lina@xingchen.example',
        position: '市场经理',
        customerNo: 'CUS-SAMPLE-0001',
        ownerId: salesA,
        createdAt: daysAgo(now, 40),
      },
      {
        key: 'contact-wang-qiang',
        name: '王强',
        phone: '13800000003',
        email: 'wangqiang@lanhai.example',
        position: '总经理',
        customerNo: 'CUS-SAMPLE-0002',
        ownerId: salesB,
        createdAt: daysAgo(now, 35),
      },
      {
        key: 'contact-zhao-min',
        name: '赵敏',
        phone: '13800000004',
        email: 'zhaomin@yunfan.example',
        position: '教务主任',
        customerNo: 'CUS-SAMPLE-0003',
        ownerId: salesA,
        createdAt: daysAgo(now, 28),
      },
      {
        key: 'contact-chen-jie',
        name: '陈杰',
        phone: '13800000005',
        email: 'chenjie@hengxin.example',
        position: '生产主管',
        customerNo: 'CUS-SAMPLE-0004',
        ownerId: salesB,
        createdAt: daysAgo(now, 21),
      },
      {
        key: 'contact-liu-yang',
        name: '刘洋',
        phone: '13800000006',
        email: 'liuyang@lvyuan.example',
        position: '采购经理',
        customerNo: 'CUS-SAMPLE-0005',
        ownerId: salesA,
        createdAt: daysAgo(now, 60),
      },
    ];

    for (const contact of contacts) {
      const customerId = customerIds.get(contact.customerNo);
      if (customerId === undefined) continue;
      const existing = await query
        .selectFrom('contacts')
        .select('id')
        .where('name', '=', contact.name)
        .where('customerId', '=', customerId)
        .executeTakeFirst();
      if (existing) {
        contactIds.set(contact.key, Number(existing.id));
        continue;
      }
      const inserted = await query
        .insertInto('contacts')
        .values({
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          position: contact.position,
          customerId,
          ownerId: contact.ownerId,
          createdAt: contact.createdAt,
          updatedAt: contact.createdAt,
        })
        .execute();
      contactIds.set(contact.key, Number(inserted.insertId));
    }

    // --- Leads --------------------------------------------------------------

    const leads: ReadonlyArray<{
      no: string;
      companyName: string;
      contactName: string;
      phone: string;
      email: string;
      source: string;
      ownerId: string | null;
      status: string;
      notes: string;
      createdAt: Date;
    }> = [
      {
        no: 'LEAD-SAMPLE-0001',
        companyName: '华信咨询',
        contactName: '孙丽',
        phone: '13900000001',
        email: 'sunli@huaxin.example',
        source: '官网',
        ownerId: null,
        status: 'new',
        notes: '官网表单提交，咨询客户管理系统。',
        createdAt: daysAgo(now, 5),
      },
      {
        no: 'LEAD-SAMPLE-0002',
        companyName: '天启网络',
        contactName: '周杰',
        phone: '13900000002',
        email: 'zhoujie@tianqi.example',
        source: '展会',
        ownerId: salesA,
        status: 'assigned',
        notes: '行业展会收集的名片，已分配跟进。',
        createdAt: daysAgo(now, 8),
      },
      {
        no: 'LEAD-SAMPLE-0003',
        companyName: '博远物流',
        contactName: '吴芳',
        phone: '13900000003',
        email: 'wufang@boyuan.example',
        source: '转介绍',
        ownerId: null,
        status: 'new',
        notes: '老客户转介绍，需要尽快联系。',
        createdAt: daysAgo(now, 2),
      },
      {
        no: 'LEAD-SAMPLE-0004',
        companyName: '中科智能',
        contactName: '郑浩',
        phone: '13900000004',
        email: 'zhenghao@zhongke.example',
        source: '广告',
        ownerId: salesB,
        status: 'assigned',
        notes: '线上广告留资，已分配跟进。',
        createdAt: daysAgo(now, 6),
      },
    ];

    for (const lead of leads) {
      const existing = await query
        .selectFrom('leads')
        .select('id')
        .where('leadNo', '=', lead.no)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('leads')
        .values({
          leadNo: lead.no,
          companyName: lead.companyName,
          contactName: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          source: lead.source,
          ownerId: lead.ownerId,
          status: lead.status,
          notes: lead.notes,
          convertedAt: null,
          convertedCustomerId: null,
          createdAt: lead.createdAt,
          updatedAt: lead.createdAt,
        })
        .execute();
    }

    // --- Opportunities ------------------------------------------------------

    const opportunities: ReadonlyArray<{
      no: string;
      name: string;
      customerNo: string;
      ownerId: string;
      stage: string;
      expectedAmount: number;
      winProbability: number;
      expectedCloseDate: Date | null;
      actualAmount: number | null;
      resultReason: string | null;
      approvalStatus: string;
      isArchived: boolean;
      contactKeys: readonly string[];
      createdAt: Date;
    }> = [
      {
        no: 'OPP-SAMPLE-0001',
        name: '星辰科技 ERP 项目',
        customerNo: 'CUS-SAMPLE-0001',
        ownerId: salesA,
        stage: 'negotiation',
        expectedAmount: 500000,
        winProbability: 80,
        expectedCloseDate: daysAgo(now, -30),
        actualAmount: null,
        resultReason: null,
        approvalStatus: 'approved',
        isArchived: false,
        contactKeys: ['contact-zhang-wei', 'contact-li-na'],
        createdAt: daysAgo(now, 30),
      },
      {
        no: 'OPP-SAMPLE-0002',
        name: '蓝海贸易 供应链系统',
        customerNo: 'CUS-SAMPLE-0002',
        ownerId: salesB,
        stage: 'proposal-quote',
        expectedAmount: 300000,
        winProbability: 60,
        expectedCloseDate: daysAgo(now, -45),
        actualAmount: null,
        resultReason: null,
        approvalStatus: 'pending',
        isArchived: false,
        contactKeys: ['contact-wang-qiang'],
        createdAt: daysAgo(now, 25),
      },
      {
        no: 'OPP-SAMPLE-0003',
        name: '云帆教育 在线教学平台',
        customerNo: 'CUS-SAMPLE-0003',
        ownerId: salesA,
        stage: 'needs-confirmation',
        expectedAmount: 200000,
        winProbability: 30,
        expectedCloseDate: daysAgo(now, -60),
        actualAmount: null,
        resultReason: null,
        approvalStatus: 'pending',
        isArchived: false,
        contactKeys: ['contact-zhao-min'],
        createdAt: daysAgo(now, 20),
      },
      {
        no: 'OPP-SAMPLE-0004',
        name: '恒信制造 MES 项目',
        customerNo: 'CUS-SAMPLE-0004',
        ownerId: salesB,
        stage: 'new',
        expectedAmount: 800000,
        winProbability: 10,
        expectedCloseDate: daysAgo(now, -90),
        actualAmount: null,
        resultReason: null,
        approvalStatus: 'pending',
        isArchived: false,
        contactKeys: ['contact-chen-jie'],
        createdAt: daysAgo(now, 10),
      },
      {
        no: 'OPP-SAMPLE-0005',
        name: '绿源食品 追溯系统',
        customerNo: 'CUS-SAMPLE-0005',
        ownerId: salesA,
        stage: 'won',
        expectedAmount: 150000,
        winProbability: 100,
        expectedCloseDate: daysAgo(now, -20),
        actualAmount: 150000,
        resultReason: '客户认可方案，签约成功',
        approvalStatus: 'approved',
        isArchived: false,
        contactKeys: ['contact-liu-yang'],
        createdAt: daysAgo(now, 50),
      },
      {
        no: 'OPP-SAMPLE-0006',
        name: '蓝海贸易 仓储管理系统',
        customerNo: 'CUS-SAMPLE-0002',
        ownerId: salesB,
        stage: 'lost',
        expectedAmount: 120000,
        winProbability: 0,
        expectedCloseDate: daysAgo(now, -15),
        actualAmount: null,
        resultReason: '客户预算不足，暂缓采购',
        approvalStatus: 'rejected',
        isArchived: false,
        contactKeys: ['contact-wang-qiang'],
        createdAt: daysAgo(now, 45),
      },
    ];

    for (const opportunity of opportunities) {
      const customerId = customerIds.get(opportunity.customerNo);
      if (customerId === undefined) continue;
      const existing = await query
        .selectFrom('opportunities')
        .select('id')
        .where('opportunityNo', '=', opportunity.no)
        .executeTakeFirst();
      if (existing) {
        opportunityIds.set(opportunity.no, Number(existing.id));
        continue;
      }
      const weightedAmount =
        Math.round(opportunity.expectedAmount * opportunity.winProbability) /
        100;
      const inserted = await query
        .insertInto('opportunities')
        .values({
          opportunityNo: opportunity.no,
          name: opportunity.name,
          customerId,
          ownerId: opportunity.ownerId,
          stage: opportunity.stage,
          expectedAmount: opportunity.expectedAmount,
          winProbability: opportunity.winProbability,
          weightedAmount,
          expectedCloseDate: opportunity.expectedCloseDate,
          actualAmount: opportunity.actualAmount,
          resultReason: opportunity.resultReason,
          approvalStatus: opportunity.approvalStatus,
          isArchived: opportunity.isArchived,
          createdAt: opportunity.createdAt,
          updatedAt: opportunity.createdAt,
        })
        .execute();
      const opportunityId = Number(inserted.insertId);
      opportunityIds.set(opportunity.no, opportunityId);
      for (const contactKey of opportunity.contactKeys) {
        const contactId = contactIds.get(contactKey);
        if (contactId === undefined) continue;
        await query
          .insertInto('opportunityContacts')
          .values({
            opportunityId,
            contactId,
            createdAt: opportunity.createdAt,
            updatedAt: opportunity.createdAt,
          })
          .execute();
      }
    }

    // --- Follow-ups ---------------------------------------------------------

    const followUps: ReadonlyArray<{
      subject: string;
      method: string;
      followUpAt: Date;
      nextFollowUpAt: Date | null;
      content: string;
      customerNo: string;
      opportunityNo: string | null;
      contactKey: string | null;
      ownerId: string;
      createdAt: Date;
    }> = [
      {
        subject: 'ERP 项目商务谈判',
        method: 'meeting',
        followUpAt: daysAgo(now, 1),
        nextFollowUpAt: daysAgo(now, 1),
        content: '与张伟总监面谈，客户对方案整体满意，正在内部走审批流程。',
        customerNo: 'CUS-SAMPLE-0001',
        opportunityNo: 'OPP-SAMPLE-0001',
        contactKey: 'contact-zhang-wei',
        ownerId: salesA,
        createdAt: daysAgo(now, 1),
      },
      {
        subject: '供应链系统方案讲解',
        method: 'visit',
        followUpAt: daysAgo(now, 2),
        nextFollowUpAt: daysAgo(now, -1),
        content: '上门演示供应链系统，客户提出定制化需求，已记录。',
        customerNo: 'CUS-SAMPLE-0002',
        opportunityNo: 'OPP-SAMPLE-0002',
        contactKey: 'contact-wang-qiang',
        ownerId: salesB,
        createdAt: daysAgo(now, 2),
      },
      {
        subject: '在线平台需求沟通',
        method: 'phone',
        followUpAt: daysAgo(now, 3),
        nextFollowUpAt: daysAgo(now, -3),
        content: '电话沟通在线教学平台需求，客户下周提供详细需求文档。',
        customerNo: 'CUS-SAMPLE-0003',
        opportunityNo: 'OPP-SAMPLE-0003',
        contactKey: 'contact-zhao-min',
        ownerId: salesA,
        createdAt: daysAgo(now, 3),
      },
      {
        subject: 'MES 项目初次拜访',
        method: 'visit',
        followUpAt: daysAgo(now, 4),
        nextFollowUpAt: daysAgo(now, -2),
        content: '拜访恒信制造生产车间，了解 MES 需求，约定下次技术交流。',
        customerNo: 'CUS-SAMPLE-0004',
        opportunityNo: 'OPP-SAMPLE-0004',
        contactKey: 'contact-chen-jie',
        ownerId: salesB,
        createdAt: daysAgo(now, 4),
      },
    ];

    for (const followUp of followUps) {
      const customerId = customerIds.get(followUp.customerNo);
      if (customerId === undefined) continue;
      const opportunityId = followUp.opportunityNo
        ? opportunityIds.get(followUp.opportunityNo)
        : undefined;
      const contactId = followUp.contactKey
        ? contactIds.get(followUp.contactKey)
        : undefined;
      const existing = await query
        .selectFrom('followUps')
        .select('id')
        .where('subject', '=', followUp.subject)
        .where('customerId', '=', customerId)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('followUps')
        .values({
          subject: followUp.subject,
          method: followUp.method,
          followUpAt: followUp.followUpAt,
          nextFollowUpAt: followUp.nextFollowUpAt,
          content: followUp.content,
          customerId,
          opportunityId: opportunityId ?? null,
          contactId: contactId ?? null,
          ownerId: followUp.ownerId,
          createdAt: followUp.createdAt,
          updatedAt: followUp.createdAt,
        })
        .execute();
    }
  },
});

async function userIdByEmail(
  query: SeedContext['query'],
  email: string,
): Promise<string | null> {
  const user = await query
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();
  return user ? String(user.id) : null;
}

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

export default seed;
