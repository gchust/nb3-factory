import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demonstration records for the customer project delivery and acceptance
 * archive system.
 *
 * The dataset is declared in this file rather than shared with another module:
 * the seed loader imports seed files directly, so a seed that reaches outside
 * its own directory would depend on a module resolution step that only exists
 * in one of the two ways this application runs (source and compiled).
 *
 * Every row uses an explicit identifier and is inserted only when that
 * identifier is still absent, so re-running the seed changes nothing and never
 * overwrites data a user has edited.
 */
export const USER_IDS = {
  admin: 'demo-user-0000-4000-8000-000000000000',
  manager: 'demo-user-0000-4000-8000-000000000001',
  acceptor: 'demo-user-0000-4000-8000-000000000002',
  finance: 'demo-user-0000-4000-8000-000000000003',
  member: 'demo-user-0000-4000-8000-000000000004',
} as const;

export const DEMO_PASSWORD = 'Demo@12345';

export interface DemoUser {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'lead' | 'manager' | 'acceptor' | 'finance' | 'member';
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: USER_IDS.manager,
    username: 'pmanager',
    name: '张伟',
    email: 'pmanager@example.invalid',
    role: 'manager',
  },
  {
    id: USER_IDS.acceptor,
    username: 'acceptor',
    name: '李娜',
    email: 'acceptor@example.invalid',
    role: 'acceptor',
  },
  {
    id: USER_IDS.finance,
    username: 'finance',
    name: '王芳',
    email: 'finance@example.invalid',
    role: 'finance',
  },
  {
    id: USER_IDS.member,
    username: 'member',
    name: '赵强',
    email: 'member@example.invalid',
    role: 'member',
  },
];

export const USER_NAMES: Readonly<Record<string, string>> = {
  [USER_IDS.manager]: '张伟',
  [USER_IDS.acceptor]: '李娜',
  [USER_IDS.finance]: '王芳',
  [USER_IDS.member]: '赵强',
};

const TIMESTAMP = '2026-01-05T09:00:00.000';

export interface DemoCustomer {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly industry: string;
  readonly level: string;
  readonly ownerId: string;
  readonly note: string;
}

export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  {
    id: 1,
    code: 'C001',
    name: '恒远智能制造有限公司',
    industry: '智能制造',
    level: 'A',
    ownerId: USER_IDS.manager,
    note: '重点客户，年度框架合作。',
  },
  {
    id: 2,
    code: 'C002',
    name: '云启科技股份有限公司',
    industry: '软件与信息服务',
    level: 'A',
    ownerId: USER_IDS.manager,
    note: '数据平台与运维服务。',
  },
  {
    id: 3,
    code: 'C003',
    name: '南岭能源集团',
    industry: '能源',
    level: 'B',
    ownerId: USER_IDS.manager,
    note: '交付验收流程要求严格。',
  },
  {
    id: 4,
    code: 'C004',
    name: '明湖医药物流有限公司',
    industry: '医药物流',
    level: 'B',
    ownerId: USER_IDS.manager,
    note: '新签客户，合同仍在起草。',
  },
];

export interface DemoContact {
  readonly id: number;
  readonly customerId: number;
  readonly name: string;
  readonly title: string;
  readonly phone: string;
  readonly email: string;
  readonly isPrimary: boolean;
}

export const DEMO_CONTACTS: readonly DemoContact[] = [
  {
    id: 101,
    customerId: 1,
    name: '陈国强',
    title: '信息中心主任',
    phone: '13800000001',
    email: 'chen@example.invalid',
    isPrimary: true,
  },
  {
    id: 102,
    customerId: 1,
    name: '周敏',
    title: '采购经理',
    phone: '13800000002',
    email: 'zhou@example.invalid',
    isPrimary: false,
  },
  {
    id: 103,
    customerId: 2,
    name: '林晓',
    title: '技术总监',
    phone: '13800000003',
    email: 'lin@example.invalid',
    isPrimary: true,
  },
  {
    id: 104,
    customerId: 2,
    name: '吴桐',
    title: '项目经理',
    phone: '13800000004',
    email: 'wu@example.invalid',
    isPrimary: false,
  },
  {
    id: 105,
    customerId: 3,
    name: '黄海',
    title: '运营副总',
    phone: '13800000005',
    email: 'huang@example.invalid',
    isPrimary: true,
  },
  {
    id: 106,
    customerId: 3,
    name: '许静',
    title: '法务专员',
    phone: '13800000006',
    email: 'xu@example.invalid',
    isPrimary: false,
  },
  {
    id: 107,
    customerId: 4,
    name: '罗成',
    title: '供应链负责人',
    phone: '13800000007',
    email: 'luo@example.invalid',
    isPrimary: true,
  },
  {
    id: 108,
    customerId: 4,
    name: '孙欣',
    title: '质量主管',
    phone: '13800000008',
    email: 'sun@example.invalid',
    isPrimary: false,
  },
];

export interface DemoContract {
  readonly id: number;
  readonly contractNo: string;
  readonly title: string;
  readonly customerId: number;
  readonly amountCents: number;
  readonly currency: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly managerId: string;
  readonly status: string;
  readonly note: string;
}

export const DEMO_CONTRACTS: readonly DemoContract[] = [
  {
    id: 1,
    contractNo: 'CD-2026-001',
    title: '恒远智能制造 ERP 实施服务',
    customerId: 1,
    amountCents: 120_000_000,
    currency: 'CNY',
    startDate: '2026-01-05',
    endDate: '2026-12-20',
    managerId: USER_IDS.manager,
    status: 'performing',
    note: '分两个里程碑验收。',
  },
  {
    id: 2,
    contractNo: 'CD-2026-002',
    title: '云启科技数据中台建设',
    customerId: 2,
    amountCents: 240_000_000,
    currency: 'CNY',
    startDate: '2026-02-01',
    endDate: '2027-01-31',
    managerId: USER_IDS.manager,
    status: 'active',
    note: '合同已生效，等待启动。',
  },
  {
    id: 3,
    contractNo: 'CD-2026-003',
    title: '南岭能源智能巡检系统',
    customerId: 3,
    amountCents: 180_000_000,
    currency: 'CNY',
    startDate: '2026-03-01',
    endDate: '2026-11-30',
    managerId: USER_IDS.manager,
    status: 'performing',
    note: '第一个里程碑已完成验收并结清收款。',
  },
  {
    id: 4,
    contractNo: 'CD-2026-004',
    title: '明湖医药物流仓储管理系统',
    customerId: 4,
    amountCents: 90_000_000,
    currency: 'CNY',
    startDate: '2026-06-01',
    endDate: '2027-03-31',
    managerId: USER_IDS.manager,
    status: 'draft',
    note: '草稿合同，等待客户确认条款。',
  },
  {
    id: 5,
    contractNo: 'CD-2026-005',
    title: '恒远智能制造设备物联改造',
    customerId: 1,
    amountCents: 150_000_000,
    currency: 'CNY',
    startDate: '2025-07-01',
    endDate: '2026-03-31',
    managerId: USER_IDS.manager,
    status: 'completed',
    note: '两个里程碑均已验收结清。',
  },
  {
    id: 6,
    contractNo: 'CD-2026-006',
    title: '云启科技运维支持服务',
    customerId: 2,
    amountCents: 60_000_000,
    currency: 'CNY',
    startDate: '2025-05-01',
    endDate: '2026-05-31',
    managerId: USER_IDS.manager,
    status: 'terminated',
    note: '客户业务调整，双方协商终止。',
  },
];

export interface DemoContractMember {
  readonly id: number;
  readonly projectId: number;
  readonly userId: string;
  readonly memberRole: string;
}

export const DEMO_CONTRACT_MEMBERS: readonly DemoContractMember[] = [
  { id: 201, projectId: 1, userId: USER_IDS.manager, memberRole: 'manager' },
  { id: 202, projectId: 1, userId: USER_IDS.acceptor, memberRole: 'acceptor' },
  { id: 203, projectId: 1, userId: USER_IDS.member, memberRole: 'member' },
  { id: 204, projectId: 3, userId: USER_IDS.manager, memberRole: 'manager' },
  { id: 205, projectId: 3, userId: USER_IDS.acceptor, memberRole: 'acceptor' },
  { id: 206, projectId: 3, userId: USER_IDS.member, memberRole: 'member' },
  { id: 207, projectId: 5, userId: USER_IDS.manager, memberRole: 'manager' },
  { id: 208, projectId: 2, userId: USER_IDS.manager, memberRole: 'manager' },
];

export interface DemoContractChange {
  readonly id: number;
  readonly projectId: number;
  readonly changeType: string;
  readonly summary: string;
  readonly beforeValue: string;
  readonly afterValue: string;
  readonly createdById: string;
}

export const DEMO_CONTRACT_CHANGES: readonly DemoContractChange[] = [
  {
    id: 301,
    projectId: 3,
    changeType: 'amount',
    summary: '客户追加现场培训与二次巡检，合同金额上调。',
    beforeValue: '1500000.00',
    afterValue: '1800000.00',
    createdById: USER_IDS.manager,
  },
  {
    id: 302,
    projectId: 3,
    changeType: 'date',
    summary: '因客户机房改造延期，终验日期顺延一个月。',
    beforeValue: '2026-10-31',
    afterValue: '2026-11-30',
    createdById: USER_IDS.manager,
  },
  {
    id: 303,
    projectId: 1,
    changeType: 'scope',
    summary: '补充移动端报工范围。',
    beforeValue: 'PC 端报工',
    afterValue: 'PC 端与移动端报工',
    createdById: USER_IDS.manager,
  },
];

export interface DemoMilestone {
  readonly id: number;
  readonly projectId: number;
  readonly name: string;
  readonly seq: number;
  readonly dueDate: string;
  readonly ownerId: string;
  readonly acceptorId: string;
  readonly amountCents: number;
  readonly status: string;
}

export const DEMO_MILESTONES: readonly DemoMilestone[] = [
  {
    id: 1,
    projectId: 1,
    name: '启动与需求确认',
    seq: 1,
    dueDate: '2026-02-15',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 30_000_000,
    status: 'accepted',
  },
  {
    id: 2,
    projectId: 1,
    name: '上线与终验',
    seq: 2,
    dueDate: '2026-09-10',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 40_000_000,
    status: 'in_progress',
  },
  {
    id: 3,
    projectId: 2,
    name: '数据接入方案',
    seq: 1,
    dueDate: '2026-04-30',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 60_000_000,
    status: 'accepted',
  },
  {
    id: 4,
    projectId: 2,
    name: '平台上线验收',
    seq: 2,
    dueDate: '2026-12-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 80_000_000,
    status: 'pending',
  },
  {
    id: 5,
    projectId: 3,
    name: '需求与接口确认',
    seq: 1,
    dueDate: '2026-03-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 45_000_000,
    status: 'accepted',
  },
  {
    id: 6,
    projectId: 3,
    name: '系统上线验收',
    seq: 2,
    dueDate: '2026-10-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 55_000_000,
    status: 'in_progress',
  },
  {
    id: 7,
    projectId: 4,
    name: '方案设计',
    seq: 1,
    dueDate: '2026-08-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 30_000_000,
    status: 'pending',
  },
  {
    id: 8,
    projectId: 4,
    name: '系统交付',
    seq: 2,
    dueDate: '2027-02-28',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 40_000_000,
    status: 'pending',
  },
  {
    id: 9,
    projectId: 5,
    name: '设备接入完成',
    seq: 1,
    dueDate: '2025-10-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 70_000_000,
    status: 'accepted',
  },
  {
    id: 10,
    projectId: 5,
    name: '项目终验',
    seq: 2,
    dueDate: '2026-03-15',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 80_000_000,
    status: 'accepted',
  },
  {
    id: 11,
    projectId: 6,
    name: '首年运维服务',
    seq: 1,
    dueDate: '2026-04-30',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 30_000_000,
    status: 'pending',
  },
  {
    id: 12,
    projectId: 6,
    name: '二期可选扩容',
    seq: 2,
    dueDate: '2026-05-31',
    ownerId: USER_IDS.manager,
    acceptorId: USER_IDS.acceptor,
    amountCents: 30_000_000,
    status: 'pending',
  },
];

export interface DemoDeliverable {
  readonly id: number;
  readonly milestoneId: number;
  readonly name: string;
  readonly status: 'todo' | 'in_progress' | 'done';
  readonly required: boolean;
  readonly assigneeId: string;
  readonly currentVersion: number;
}

export const DEMO_DELIVERABLES: readonly DemoDeliverable[] = [
  {
    id: 1,
    milestoneId: 1,
    name: '需求规格说明书',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 2,
  },
  {
    id: 2,
    milestoneId: 2,
    name: '上线验收材料',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 1,
  },
  {
    id: 3,
    milestoneId: 3,
    name: '数据接入方案',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 1,
  },
  {
    id: 4,
    milestoneId: 4,
    name: '平台上线验收包',
    status: 'todo',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 5,
    milestoneId: 5,
    name: '需求与接口确认成果',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 2,
  },
  {
    id: 6,
    milestoneId: 6,
    name: '系统上线验收包',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 1,
  },
  {
    id: 7,
    milestoneId: 7,
    name: '仓储系统设计方案',
    status: 'in_progress',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 8,
    milestoneId: 8,
    name: '仓储系统交付包',
    status: 'todo',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 9,
    milestoneId: 9,
    name: '设备接入报告',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 1,
  },
  {
    id: 10,
    milestoneId: 10,
    name: '项目终验报告',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 1,
  },
  {
    id: 11,
    milestoneId: 11,
    name: '运维服务报告',
    status: 'in_progress',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 12,
    milestoneId: 12,
    name: '扩容方案',
    status: 'todo',
    required: false,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  // A milestone can carry several work items, and only the required ones block
  // the acceptance submission.
  {
    id: 13,
    milestoneId: 1,
    name: '原型与交互稿确认',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 14,
    milestoneId: 1,
    name: '培训封面设计',
    status: 'done',
    required: false,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 15,
    milestoneId: 5,
    name: '接口文档整理',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 16,
    milestoneId: 3,
    name: '测试报告编写',
    status: 'done',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 17,
    milestoneId: 6,
    name: '验收材料准备',
    status: 'in_progress',
    required: true,
    assigneeId: USER_IDS.member,
    currentVersion: 0,
  },
  {
    id: 18,
    milestoneId: 6,
    name: '培训材料准备',
    status: 'todo',
    required: false,
    assigneeId: USER_IDS.manager,
    currentVersion: 0,
  },
];

export interface DemoIssue {
  readonly id: number;
  readonly projectId: number;
  readonly milestoneId: number;
  readonly taskId: number | null;
  readonly title: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly status: 'open' | 'in_progress' | 'resolved' | 'closed';
  readonly ownerId: string;
  readonly resolution: string | null;
  readonly createdById: string;
}

export const DEMO_ISSUES: readonly DemoIssue[] = [
  {
    id: 1,
    projectId: 3,
    milestoneId: 6,
    taskId: 6,
    title: '生产环境第三方证书未按时提供',
    description:
      '客户尚未提供生产环境的 HTTPS 证书，导致上线验收环境无法按计划开通。',
    severity: 'high',
    status: 'open',
    ownerId: USER_IDS.member,
    resolution: null,
    createdById: USER_IDS.manager,
  },
  {
    id: 2,
    projectId: 1,
    milestoneId: 2,
    taskId: 2,
    title: '上线窗口与客户维护期冲突',
    description: '客户月度维护期与上线窗口重叠，需要重新确认可停机时段。',
    severity: 'medium',
    status: 'in_progress',
    ownerId: USER_IDS.manager,
    resolution: '已提交调整后的上线排期，等待客户确认。',
    createdById: USER_IDS.member,
  },
  {
    id: 3,
    projectId: 2,
    milestoneId: 4,
    taskId: 4,
    title: '数据接入字段口径不一致',
    description: '设备台账的出产日期字段在客户侧存在两种格式，需要统一。',
    severity: 'critical',
    status: 'resolved',
    ownerId: USER_IDS.member,
    resolution: '按合同附件中的字段口径统一，并补充了导入校验。',
    createdById: USER_IDS.manager,
  },
  {
    id: 4,
    projectId: 5,
    milestoneId: 10,
    taskId: 10,
    title: '终验报告缺少签字页',
    description: '归档的终验报告缺少客户签字页扫描件。',
    severity: 'low',
    status: 'closed',
    ownerId: USER_IDS.member,
    resolution: '已补充签字页并重新归档。',
    createdById: USER_IDS.acceptor,
  },
];

export interface DemoVersion {
  readonly id: number;
  readonly taskId: number;
  readonly versionNo: number;
  readonly status: string;
  readonly note: string | null;
  readonly submittedById: string | null;
  readonly submittedAt: string | null;
  readonly reviewerId: string | null;
  readonly reviewedAt: string | null;
  readonly reviewComment: string | null;
}

export const DEMO_VERSIONS: readonly DemoVersion[] = [
  {
    id: 1,
    taskId: 1,
    versionNo: 1,
    status: 'returned',
    note: '初稿',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-01-20T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-01-22T10:00:00.000',
    reviewComment: '缺少接口清单与验收标准章节，请补充后重新提交。',
  },
  {
    id: 2,
    taskId: 1,
    versionNo: 2,
    status: 'approved',
    note: '补充接口清单与验收标准',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-01-26T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-01-28T10:00:00.000',
    reviewComment: '内容完整，验收通过。',
  },
  {
    id: 3,
    taskId: 3,
    versionNo: 1,
    status: 'approved',
    note: '方案评审通过',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-04-10T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-04-15T10:00:00.000',
    reviewComment: '方案可行，验收通过。',
  },
  {
    id: 4,
    taskId: 5,
    versionNo: 1,
    status: 'returned',
    note: '提交初版',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-03-05T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-03-07T10:00:00.000',
    reviewComment: '接口清单缺失，验收标准未量化，退回修改。',
  },
  {
    id: 5,
    taskId: 5,
    versionNo: 2,
    status: 'approved',
    note: '补充接口清单并量化验收标准',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-03-12T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-03-15T10:00:00.000',
    reviewComment: '已按意见修改，验收通过。',
  },
  {
    id: 6,
    taskId: 9,
    versionNo: 1,
    status: 'approved',
    note: '设备接入完成',
    submittedById: USER_IDS.manager,
    submittedAt: '2025-10-20T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2025-10-25T10:00:00.000',
    reviewComment: '接入数据核对无误。',
  },
  {
    id: 7,
    taskId: 10,
    versionNo: 1,
    status: 'approved',
    note: '终验报告',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-03-05T10:00:00.000',
    reviewerId: USER_IDS.acceptor,
    reviewedAt: '2026-03-12T10:00:00.000',
    reviewComment: '终验通过。',
  },
  {
    id: 8,
    taskId: 2,
    versionNo: 1,
    status: 'pending_review',
    note: '等待验收',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-09-12T10:00:00.000',
    reviewerId: null,
    reviewedAt: null,
    reviewComment: null,
  },
  {
    id: 9,
    taskId: 6,
    versionNo: 1,
    status: 'pending_review',
    note: '等待验收',
    submittedById: USER_IDS.manager,
    submittedAt: '2026-09-15T10:00:00.000',
    reviewerId: null,
    reviewedAt: null,
    reviewComment: null,
  },
];

export interface DemoReceivable {
  readonly id: number;
  readonly projectId: number;
  readonly milestoneId: number;
  readonly amountCents: number;
  readonly receivedCents: number;
  readonly status: string;
  readonly confirmedById: string;
  readonly confirmedAt: string;
}

export const DEMO_RECEIVABLES: readonly DemoReceivable[] = [
  {
    id: 1,
    projectId: 1,
    milestoneId: 1,
    amountCents: 30_000_000,
    receivedCents: 30_000_000,
    status: 'paid',
    confirmedById: USER_IDS.finance,
    confirmedAt: '2026-01-29T10:00:00.000',
  },
  {
    id: 2,
    projectId: 2,
    milestoneId: 3,
    amountCents: 60_000_000,
    receivedCents: 30_000_000,
    status: 'partial',
    confirmedById: USER_IDS.finance,
    confirmedAt: '2026-04-16T10:00:00.000',
  },
  {
    id: 3,
    projectId: 3,
    milestoneId: 5,
    amountCents: 45_000_000,
    receivedCents: 0,
    status: 'unpaid',
    confirmedById: USER_IDS.finance,
    confirmedAt: '2026-03-16T10:00:00.000',
  },
  {
    id: 4,
    projectId: 5,
    milestoneId: 9,
    amountCents: 70_000_000,
    receivedCents: 70_000_000,
    status: 'paid',
    confirmedById: USER_IDS.finance,
    confirmedAt: '2025-10-26T10:00:00.000',
  },
  {
    id: 5,
    projectId: 5,
    milestoneId: 10,
    amountCents: 80_000_000,
    receivedCents: 40_000_000,
    status: 'partial',
    confirmedById: USER_IDS.finance,
    confirmedAt: '2026-03-13T10:00:00.000',
  },
];

export interface DemoPayment {
  readonly id: number;
  readonly settlementId: number;
  readonly amountCents: number;
  readonly receivedAt: string;
  readonly method: string;
  readonly note: string;
  readonly createdById: string;
}

export const DEMO_PAYMENTS: readonly DemoPayment[] = [
  {
    id: 1,
    settlementId: 1,
    amountCents: 30_000_000,
    receivedAt: '2026-02-05',
    method: 'transfer',
    note: '首期款，一次结清。',
    createdById: USER_IDS.finance,
  },
  {
    id: 2,
    settlementId: 2,
    amountCents: 30_000_000,
    receivedAt: '2026-04-20',
    method: 'transfer',
    note: '第一笔回款。',
    createdById: USER_IDS.finance,
  },
  {
    id: 3,
    settlementId: 4,
    amountCents: 70_000_000,
    receivedAt: '2025-11-05',
    method: 'transfer',
    note: '设备接入款。',
    createdById: USER_IDS.finance,
  },
  {
    id: 4,
    settlementId: 5,
    amountCents: 40_000_000,
    receivedAt: '2026-03-20',
    method: 'acceptance',
    note: '终验首笔款。',
    createdById: USER_IDS.finance,
  },
];

/** Deterministic UUID for each seeded file record. */
export const FILE_IDS: readonly string[] = [
  '1f0a0000-0000-4000-8000-000000000001',
  '1f0a0000-0000-4000-8000-000000000002',
  '1f0a0000-0000-4000-8000-000000000003',
  '1f0a0000-0000-4000-8000-000000000004',
  '1f0a0000-0000-4000-8000-000000000005',
  '1f0a0000-0000-4000-8000-000000000006',
  '1f0a0000-0000-4000-8000-000000000007',
  '1f0a0000-0000-4000-8000-000000000008',
  '1f0a0000-0000-4000-8000-000000000009',
  '1f0a0000-0000-4000-8000-000000000010',
];

async function insertMissing(
  { query }: SeedContext,
  table: string,
  id: number | string,
  values: Record<string, unknown>,
): Promise<void> {
  const existing = await query
    .selectFrom(table)
    .select('id')
    .where('id', '=', id)
    .limit(1)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto(table)
    .values({ id, ...values })
    .execute();
}

const seed: SeedDefinition = defineSeed({
  name: '202609200010_seed_project_delivery_demo',

  async run(context) {
    const { query } = context;

    for (const user of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .limit(1)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('user')
        .values({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: true,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: `demo-account-${user.id}`,
          issuer: 'local:credential',
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        })
        .execute();
    }

    // The built-in administrator is created by the authentication plugin under
    // a generated id, so the business lead role is attached by username.
    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .limit(1)
      .executeTakeFirst();
    const roleAssignments: readonly { userId: string; role: string }[] = [
      ...(admin ? [{ userId: String(admin.id), role: 'lead' }] : []),
      ...DEMO_USERS.map((user) => ({ userId: user.id, role: user.role })),
    ];
    for (const assignment of roleAssignments) {
      const existing = await query
        .selectFrom('deliveryRoleAssignments')
        .select('id')
        .where('userId', '=', assignment.userId)
        .where('role', '=', assignment.role)
        .limit(1)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('deliveryRoleAssignments')
        .values({
          userId: assignment.userId,
          role: assignment.role,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        })
        .execute();
    }

    for (const customer of DEMO_CUSTOMERS) {
      await insertMissing(context, 'deliveryCustomers', customer.id, {
        code: customer.code,
        name: customer.name,
        industry: customer.industry,
        level: customer.level,
        ownerId: customer.ownerId,
        note: customer.note,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const contact of DEMO_CONTACTS) {
      await insertMissing(context, 'deliveryContacts', contact.id, {
        customerId: contact.customerId,
        name: contact.name,
        title: contact.title,
        phone: contact.phone,
        email: contact.email,
        isPrimary: contact.isPrimary,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const contract of DEMO_CONTRACTS) {
      await insertMissing(context, 'deliveryProjects', contract.id, {
        contractNo: contract.contractNo,
        title: contract.title,
        customerId: contract.customerId,
        amountCents: contract.amountCents,
        currency: contract.currency,
        startDate: contract.startDate,
        endDate: contract.endDate,
        managerId: contract.managerId,
        status: contract.status,
        note: contract.note,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const member of DEMO_CONTRACT_MEMBERS) {
      await insertMissing(context, 'deliveryProjectMembers', member.id, {
        projectId: member.projectId,
        userId: member.userId,
        memberRole: member.memberRole,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const change of DEMO_CONTRACT_CHANGES) {
      await insertMissing(context, 'deliveryChangeRecords', change.id, {
        projectId: change.projectId,
        changeType: change.changeType,
        summary: change.summary,
        beforeValue: change.beforeValue,
        afterValue: change.afterValue,
        createdById: change.createdById,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const milestone of DEMO_MILESTONES) {
      await insertMissing(context, 'deliveryMilestones', milestone.id, {
        projectId: milestone.projectId,
        name: milestone.name,
        seq: milestone.seq,
        dueDate: milestone.dueDate,
        ownerId: milestone.ownerId,
        acceptorId: milestone.acceptorId,
        amountCents: milestone.amountCents,
        status: milestone.status,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const deliverable of DEMO_DELIVERABLES) {
      await insertMissing(context, 'deliveryTasks', deliverable.id, {
        milestoneId: deliverable.milestoneId,
        name: deliverable.name,
        status: deliverable.status,
        required: deliverable.required,
        assigneeId: deliverable.assigneeId,
        currentVersion: deliverable.currentVersion,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const issue of DEMO_ISSUES) {
      await insertMissing(context, 'deliveryIssues', issue.id, {
        projectId: issue.projectId,
        milestoneId: issue.milestoneId,
        taskId: issue.taskId,
        title: issue.title,
        description: issue.description,
        severity: issue.severity,
        status: issue.status,
        ownerId: issue.ownerId,
        resolution: issue.resolution,
        createdById: issue.createdById,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const version of DEMO_VERSIONS) {
      await insertMissing(context, 'deliveryAcceptanceBatches', version.id, {
        taskId: version.taskId,
        versionNo: version.versionNo,
        status: version.status,
        note: version.note,
        submittedById: version.submittedById,
        submittedAt: version.submittedAt,
        reviewerId: version.reviewerId,
        reviewedAt: version.reviewedAt,
        reviewComment: version.reviewComment,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const receivable of DEMO_RECEIVABLES) {
      await insertMissing(context, 'deliverySettlements', receivable.id, {
        projectId: receivable.projectId,
        milestoneId: receivable.milestoneId,
        amountCents: receivable.amountCents,
        receivedCents: receivable.receivedCents,
        status: receivable.status,
        confirmedById: receivable.confirmedById,
        confirmedAt: receivable.confirmedAt,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }

    for (const payment of DEMO_PAYMENTS) {
      await insertMissing(context, 'deliverySettlementPayments', payment.id, {
        settlementId: payment.settlementId,
        amountCents: payment.amountCents,
        receivedAt: payment.receivedAt,
        method: payment.method,
        note: payment.note,
        createdById: payment.createdById,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
    }
  },
});

export default seed;
