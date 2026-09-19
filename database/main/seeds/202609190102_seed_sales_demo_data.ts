import { defineSeed, type SeedDefinition } from '@nocobase/db';
import type { DatabaseConnection } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { createHash } from 'node:crypto';

/**
 * Demo data for the sales system: two salespeople, eight customers, twelve
 * contacts, ten opportunities across every stage and sixteen follow-ups.
 *
 * The seed is idempotent: it creates the two salespeople once (looked up by
 * username afterwards) and inserts the business rows only when the customer
 * table is still empty, so running it again never duplicates or overwrites
 * anything a user has edited.
 *
 * Follow-up dates are relative to the run date so the workbench always has
 * something overdue, something due today and something upcoming to show.
 */
const DEMO_USERS = [
  {
    key: 'zhang',
    username: 'sales.zhang',
    name: '张伟',
    email: 'zhangwei@example.com',
    password: 'Sales@123',
  },
  {
    key: 'li',
    username: 'sales.li',
    name: '李娜',
    email: 'lina@example.com',
    password: 'Sales@123',
  },
] as const;

type OwnerKey = (typeof DEMO_USERS)[number]['key'];

const CUSTOMERS: readonly {
  key: string;
  name: string;
  industry: string;
  source: string;
  importance: string;
  status: string;
  owner: OwnerKey;
  phone: string;
  email: string;
  notes: string;
}[] = [
  {
    key: 'c1',
    name: '华宇制造集团',
    industry: '制造业',
    source: '展会',
    importance: 'high',
    status: 'following',
    owner: 'zhang',
    phone: '021-58860001',
    email: 'contact@huayu.example.com',
    notes: '计划年内更换两条产线设备。',
  },
  {
    key: 'c2',
    name: '蓝海科技有限公司',
    industry: '互联网',
    source: '官网咨询',
    importance: 'high',
    status: 'following',
    owner: 'zhang',
    phone: '010-88990002',
    email: 'hello@lanhai.example.com',
    notes: '关注数据中台方案。',
  },
  {
    key: 'c3',
    name: '恒信金融服务',
    industry: '金融',
    source: '老客户转介绍',
    importance: 'normal',
    status: 'following',
    owner: 'li',
    phone: '0755-22330003',
    email: 'it@hengxin.example.com',
    notes: '合规要求较高，需提供安全说明。',
  },
  {
    key: 'c4',
    name: '优品零售连锁',
    industry: '零售',
    source: '电话开发',
    importance: 'normal',
    status: 'potential',
    owner: 'li',
    phone: '020-33440004',
    email: 'buyer@youpin.example.com',
    notes: '门店数字化意向明确。',
  },
  {
    key: 'c5',
    name: '启明教育科技',
    industry: '教育',
    source: '行业峰会',
    importance: 'high',
    status: 'following',
    owner: 'zhang',
    phone: '028-66770005',
    email: 'pm@qiming.example.com',
    notes: '预算已批复，等待方案。',
  },
  {
    key: 'c6',
    name: '康泰医疗器械',
    industry: '医疗',
    source: '官网咨询',
    importance: 'normal',
    status: 'potential',
    owner: 'li',
    phone: '027-55660006',
    email: 'procurement@kangtai.example.com',
    notes: '需要医疗器械行业案例。',
  },
  {
    key: 'c7',
    name: '天山物流',
    industry: '物流',
    source: '展会',
    importance: 'low',
    status: 'following',
    owner: 'zhang',
    phone: '0991-22110007',
    email: 'ops@tianshan.example.com',
    notes: '关注调度系统集成能力。',
  },
  {
    key: 'c8',
    name: '星辰文化传媒',
    industry: '传媒',
    source: '电话开发',
    importance: 'low',
    status: 'signed',
    owner: 'li',
    phone: '010-66770008',
    email: 'hi@xingchen.example.com',
    notes: '首期合同已签署，持续维护。',
  },
];

const CONTACTS: readonly {
  key: string;
  customer: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}[] = [
  {
    key: 'p1',
    customer: 'c1',
    name: '王建国',
    title: '设备部经理',
    phone: '13800000001',
    email: 'wang.jg@huayu.example.com',
    isPrimary: true,
  },
  {
    key: 'p2',
    customer: 'c1',
    name: '刘敏',
    title: '采购主管',
    phone: '13800000002',
    email: 'liu.min@huayu.example.com',
    isPrimary: false,
  },
  {
    key: 'p3',
    customer: 'c2',
    name: '陈晓',
    title: 'CTO',
    phone: '13800000003',
    email: 'chen.xiao@lanhai.example.com',
    isPrimary: true,
  },
  {
    key: 'p4',
    customer: 'c2',
    name: '赵雪',
    title: '项目经理',
    phone: '13800000004',
    email: 'zhao.xue@lanhai.example.com',
    isPrimary: false,
  },
  {
    key: 'p5',
    customer: 'c3',
    name: '孙浩',
    title: '信息科技部总经理',
    phone: '13800000005',
    email: 'sun.hao@hengxin.example.com',
    isPrimary: true,
  },
  {
    key: 'p6',
    customer: 'c4',
    name: '周丽',
    title: '运营总监',
    phone: '13800000006',
    email: 'zhou.li@youpin.example.com',
    isPrimary: true,
  },
  {
    key: 'p7',
    customer: 'c4',
    name: '吴强',
    title: 'IT 负责人',
    phone: '13800000007',
    email: 'wu.qiang@youpin.example.com',
    isPrimary: false,
  },
  {
    key: 'p8',
    customer: 'c5',
    name: '郑楠',
    title: '产品负责人',
    phone: '13800000008',
    email: 'zheng.nan@qiming.example.com',
    isPrimary: true,
  },
  {
    key: 'p9',
    customer: 'c6',
    name: '冯磊',
    title: '采购经理',
    phone: '13800000009',
    email: 'feng.lei@kangtai.example.com',
    isPrimary: true,
  },
  {
    key: 'p10',
    customer: 'c7',
    name: '许静',
    title: '运营经理',
    phone: '13800000010',
    email: 'xu.jing@tianshan.example.com',
    isPrimary: true,
  },
  {
    key: 'p11',
    customer: 'c8',
    name: '何明',
    title: '制作总监',
    phone: '13800000011',
    email: 'he.ming@xingchen.example.com',
    isPrimary: true,
  },
  {
    key: 'p12',
    customer: 'c8',
    name: '杨帆',
    title: '财务',
    phone: '13800000012',
    email: 'yang.fan@xingchen.example.com',
    isPrimary: false,
  },
];

const OPPORTUNITIES: readonly {
  key: string;
  customer: string;
  name: string;
  amount: number;
  expectedClose: number;
  stage: string;
  closeReason?: string;
}[] = [
  {
    key: 'o1',
    customer: 'c1',
    name: '华宇产线设备采购',
    amount: 480000,
    expectedClose: 30,
    stage: 'proposal',
  },
  {
    key: 'o2',
    customer: 'c2',
    name: '蓝海数据中台建设',
    amount: 620000,
    expectedClose: 45,
    stage: 'negotiation',
  },
  {
    key: 'o3',
    customer: 'c3',
    name: '恒信合规风控模块',
    amount: 350000,
    expectedClose: 25,
    stage: 'needs_confirmation',
  },
  {
    key: 'o4',
    customer: 'c4',
    name: '优品门店数字化一期',
    amount: 210000,
    expectedClose: 20,
    stage: 'initial_contact',
  },
  {
    key: 'o5',
    customer: 'c5',
    name: '启明教学平台升级',
    amount: 300000,
    expectedClose: 15,
    stage: 'proposal',
  },
  {
    key: 'o6',
    customer: 'c6',
    name: '康泰设备追溯系统',
    amount: 260000,
    expectedClose: 40,
    stage: 'needs_confirmation',
  },
  {
    key: 'o7',
    customer: 'c7',
    name: '天山调度系统集成',
    amount: 180000,
    expectedClose: 10,
    stage: 'initial_contact',
  },
  {
    key: 'o8',
    customer: 'c8',
    name: '星辰内容管理系统',
    amount: 150000,
    expectedClose: -5,
    stage: 'won',
    closeReason: '客户认可方案与报价，首期合同已签署。',
  },
  {
    key: 'o9',
    customer: 'c1',
    name: '华宇备件管理扩展',
    amount: 90000,
    expectedClose: 5,
    stage: 'won',
    closeReason: '老客户追加采购，商务条款沿用原合同。',
  },
  {
    key: 'o10',
    customer: 'c4',
    name: '优品会员系统改造',
    amount: 120000,
    expectedClose: -10,
    stage: 'lost',
    closeReason: '客户选择自研，本期预算取消。',
  },
];

const FOLLOW_UPS: readonly {
  key: string;
  customer: string;
  opportunity?: string;
  channel: string;
  content: string;
  occurred: number;
  next: number | null;
}[] = [
  {
    key: 'f1',
    customer: 'c1',
    opportunity: 'o1',
    channel: 'visit',
    content: '现场查看产线，确认设备型号与交期。',
    occurred: -12,
    next: -3,
  },
  {
    key: 'f2',
    customer: 'c1',
    opportunity: 'o1',
    channel: 'phone',
    content: '电话确认报价细节，客户要求增加培训。',
    occurred: -5,
    next: 2,
  },
  {
    key: 'f3',
    customer: 'c1',
    opportunity: 'o9',
    channel: 'email',
    content: '发送备件清单，等待客户确认数量。',
    occurred: -8,
    next: -1,
  },
  {
    key: 'f4',
    customer: 'c2',
    opportunity: 'o2',
    channel: 'meeting',
    content: '方案评审会，客户技术团队提出三点疑问。',
    occurred: -10,
    next: 0,
  },
  {
    key: 'f5',
    customer: 'c2',
    opportunity: 'o2',
    channel: 'email',
    content: '补充数据中台架构说明与安全白皮书。',
    occurred: -3,
    next: 3,
  },
  {
    key: 'f6',
    customer: 'c3',
    opportunity: 'o3',
    channel: 'phone',
    content: '首次沟通，了解合规与审计要求。',
    occurred: -7,
    next: 1,
  },
  {
    key: 'f7',
    customer: 'c3',
    opportunity: 'o3',
    channel: 'wechat',
    content: '发送金融行业案例资料。',
    occurred: -2,
    next: 5,
  },
  {
    key: 'f8',
    customer: 'c4',
    opportunity: 'o4',
    channel: 'phone',
    content: '初次接触，介绍门店数字化整体方案。',
    occurred: -6,
    next: 7,
  },
  {
    key: 'f9',
    customer: 'c5',
    opportunity: 'o5',
    channel: 'meeting',
    content: '讲解升级方案，客户认可整体思路。',
    occurred: -4,
    next: -2,
  },
  {
    key: 'f10',
    customer: 'c5',
    opportunity: 'o5',
    channel: 'email',
    content: '发送正式报价单与实施计划。',
    occurred: -1,
    next: 2,
  },
  {
    key: 'f11',
    customer: 'c6',
    opportunity: 'o6',
    channel: 'phone',
    content: '了解设备追溯需求与现有系统情况。',
    occurred: -9,
    next: null,
  },
  {
    key: 'f12',
    customer: 'c7',
    opportunity: 'o7',
    channel: 'visit',
    content: '走访调度中心，记录集成接口需求。',
    occurred: -11,
    next: -7,
  },
  {
    key: 'f13',
    customer: 'c7',
    opportunity: 'o7',
    channel: 'wechat',
    content: '发送接口对接说明文档。',
    occurred: -2,
    next: null,
  },
  {
    key: 'f14',
    customer: 'c8',
    opportunity: 'o8',
    channel: 'email',
    content: '合同签署完成，安排项目启动会。',
    occurred: -5,
    next: null,
  },
  {
    key: 'f15',
    customer: 'c8',
    channel: 'phone',
    content: '例行回访，客户对交付进度满意。',
    occurred: -1,
    next: 10,
  },
  {
    key: 'f16',
    customer: 'c4',
    opportunity: 'o10',
    channel: 'phone',
    content: '客户告知本期取消，保持长期联系。',
    occurred: -3,
    next: 30,
  },
];

const DAY = 24 * 60 * 60 * 1000;

const seed: SeedDefinition = defineSeed({
  name: '202609190102_seed_sales_demo_data',

  async run({ query, connection }) {
    if (!(await tableExists(connection, 'sales_customers'))) {
      return;
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const dateOnly = (offset: number): string =>
      new Date(startOfToday.getTime() + offset * DAY)
        .toISOString()
        .slice(0, 10);
    const dateTime = (offset: number, hour = 10): Date =>
      new Date(startOfToday.getTime() + offset * DAY + hour * 60 * 60 * 1000);

    const ownerId: Record<OwnerKey, string> = {
      zhang: await ensureUser(query, DEMO_USERS[0]),
      li: await ensureUser(query, DEMO_USERS[1]),
    };

    const existing = await query
      .selectFrom('salesCustomers')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const customerId = new Map<string, string>();
    const customerOwner = new Map<string, OwnerKey>();
    for (const customer of CUSTOMERS) {
      const id = stableId(`customer:${customer.key}`);
      customerId.set(customer.key, id);
      customerOwner.set(customer.key, customer.owner);
      await query
        .insertInto('salesCustomers')
        .values({
          id,
          name: customer.name,
          industry: customer.industry,
          source: customer.source,
          importance: customer.importance,
          status: customer.status,
          ownerId: ownerId[customer.owner],
          phone: customer.phone,
          email: customer.email,
          notes: customer.notes,
          avatarFileId: null,
          createdById: ownerId[customer.owner],
          createdAt: dateTime(-40, 9),
          updatedAt: dateTime(-2, 9),
        })
        .execute();
    }

    for (const contact of CONTACTS) {
      await query
        .insertInto('salesContacts')
        .values({
          id: stableId(`contact:${contact.key}`),
          customerId: customerId.get(contact.customer),
          name: contact.name,
          title: contact.title,
          phone: contact.phone,
          email: contact.email,
          isPrimary: contact.isPrimary,
          createdAt: dateTime(-35, 10),
          updatedAt: dateTime(-4, 10),
        })
        .execute();
    }

    const opportunityId = new Map<string, string>();
    for (const opportunity of OPPORTUNITIES) {
      const id = stableId(`opportunity:${opportunity.key}`);
      opportunityId.set(opportunity.key, id);
      await query
        .insertInto('salesOpportunities')
        .values({
          id,
          customerId: customerId.get(opportunity.customer),
          name: opportunity.name,
          amount: opportunity.amount,
          expectedCloseDate: dateOnly(opportunity.expectedClose),
          stage: opportunity.stage,
          closeReason: opportunity.closeReason ?? null,
          ownerId: ownerId[customerOwner.get(opportunity.customer)!],
          createdById: ownerId[customerOwner.get(opportunity.customer)!],
          createdAt: dateTime(-30, 11),
          updatedAt: dateTime(-1, 11),
        })
        .execute();
    }

    for (const followUp of FOLLOW_UPS) {
      await query
        .insertInto('salesFollowUps')
        .values({
          id: stableId(`followup:${followUp.key}`),
          customerId: customerId.get(followUp.customer),
          opportunityId: followUp.opportunity
            ? opportunityId.get(followUp.opportunity)
            : null,
          channel: followUp.channel,
          content: followUp.content,
          occurredAt: dateTime(followUp.occurred, 14),
          nextFollowUpAt:
            followUp.next === null ? null : dateOnly(followUp.next),
          createdById: ownerId[customerOwner.get(followUp.customer)!],
          createdAt: dateTime(followUp.occurred, 15),
          updatedAt: dateTime(followUp.occurred, 15),
        })
        .execute();
    }
  },
});

interface DemoUser {
  readonly key: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

async function ensureUser(
  query: DatabaseConnection['query'],
  user: DemoUser,
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst();
  if (existing) return String(existing.id);

  const now = new Date();
  const userId = crypto.randomUUID();
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(user.password),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

function stableId(key: string): string {
  const hash = createHash('sha1').update(`sales-demo:${key}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function tableExists(
  connection: ClientProvider,
  table: string,
): Promise<boolean> {
  const client = await connection.client<TableSchemaClient>();
  return client.schema.hasTable(table);
}

interface ClientProvider {
  client<T = unknown>(name?: string): Promise<T>;
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
