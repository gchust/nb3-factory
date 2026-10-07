/**
 * The after-sales service provider.
 *
 * It does four things, each at the only point the runtime allows it:
 *
 * 1. `register()` binds the domain service under `serviceToken`. The factory is
 *    deferred, so the File plugin's repository is only touched by the first
 *    request that uploads an attachment.
 * 2. `boot()` teaches authorization about the domain (collections, record
 *    selections, composite resources, permission sets) and registers the two
 *    scheduled tasks. The scheduler reads its definitions when `start()` runs,
 *    so anything registered later would silently never fire.
 * 3. `start()` provisions the installation: permission sets, the sample
 *    accounts and teams, and the fictional business data. Migrations have run by
 *    now, which is the first moment the tables exist.
 * 4. `shutdown()` releases nothing: the provider owns no connection of its own.
 *
 * Provisioning is idempotent by construction. Every row is written under a
 * deterministic id (or found by its natural key) and only when it is absent, so
 * restarting the server never duplicates a customer, a team or a work order. It
 * is also why the sample data lives here rather than in `database/main/seeds/`:
 * permission sets and accounts must be created through their services, which
 * need the running container.
 */

import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  userAdministrationServiceToken,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import {
  ATTACHMENT_ACCESS_PATH,
  COLLECTIONS,
  PERMISSION_SET_KEYS,
  RUN_KEYS,
  TASK_TYPES,
  TEAM_IDS,
} from '../service/constants.js';
import {
  registerServiceAuthorization,
  servicePermissionSets,
  type InspectionTask,
} from '../service/resources.js';
import {
  createService,
  type AssistantSettings,
  type StoredFile,
} from '../service/service.js';
import { TASK_DEFINITIONS } from '../service/tasks.js';
import { serviceToken } from '../service/tokens.js';

/**
 * Password every provisioned account starts with.
 *
 * These accounts exist so the four jobs this application ships can be
 * demonstrated and reviewed. A known constant is deliberate — a reviewer has to
 * be able to sign in — and must be changed by an administrator before the
 * application carries real work. A production start says so in the log.
 */
const SAMPLE_ACCOUNT_PASSWORD = 'NocoBase@123';

interface SampleAccount {
  readonly email: string;
  readonly name: string;
  readonly permissionSet: string;
  /** Team ids with the role this person holds in each. */
  readonly teams: readonly { readonly teamId: string; readonly role: string }[];
}

/** The four jobs the application ships, with one account to demonstrate each. */
const SAMPLE_ACCOUNTS: readonly SampleAccount[] = [
  {
    email: 'supervisor@example-service.test',
    name: '王敏',
    permissionSet: PERMISSION_SET_KEYS.supervisor,
    teams: [
      { teamId: TEAM_IDS.groupA, role: 'supervisor' },
      { teamId: TEAM_IDS.groupB, role: 'supervisor' },
    ],
  },
  {
    email: 'engineer.li@example-service.test',
    name: '李强',
    permissionSet: PERMISSION_SET_KEYS.engineer,
    teams: [{ teamId: TEAM_IDS.groupA, role: 'engineer' }],
  },
  {
    email: 'engineer.zhao@example-service.test',
    name: '赵磊',
    permissionSet: PERMISSION_SET_KEYS.engineer,
    teams: [{ teamId: TEAM_IDS.groupA, role: 'engineer' }],
  },
  {
    email: 'engineer.chen@example-service.test',
    name: '陈静',
    permissionSet: PERMISSION_SET_KEYS.engineer,
    teams: [{ teamId: TEAM_IDS.groupB, role: 'engineer' }],
  },
  {
    email: 'observer@example-service.test',
    name: '周航',
    permissionSet: PERMISSION_SET_KEYS.observer,
    teams: [],
  },
  {
    email: 'platform.api@example-service.test',
    name: '设备平台集成账号',
    permissionSet: PERMISSION_SET_KEYS.integration,
    teams: [],
  },
];

const TEAM_ROWS = [
  {
    id: TEAM_IDS.groupA,
    code: 'EAST-1',
    name: '华东服务一组',
    description: '上海、江苏、浙江的现场服务',
  },
  {
    id: TEAM_IDS.groupB,
    code: 'SOUTH-2',
    name: '华南服务二组',
    description: '广东、福建的现场服务',
  },
] as const;

const CUSTOMER_ROWS = [
  {
    id: 'svc-factory-customer-1',
    code: 'CUS-1001',
    name: '星辰精密制造有限公司',
    contactName: '刘伟',
    contactPhone: '0512-6688-1201',
    contactEmail: 'service@xingchen.example.test',
    address: '江苏省苏州市工业园区星湖街 328 号',
    level: 'key',
  },
  {
    id: 'svc-factory-customer-2',
    code: 'CUS-1002',
    name: '蓝海医疗科技股份有限公司',
    contactName: '孙倩',
    contactPhone: '021-5566-3302',
    contactEmail: 'support@lanhai.example.test',
    address: '上海市浦东新区张江高科技园区博云路 88 号',
    level: 'vip',
  },
  {
    id: 'svc-factory-customer-3',
    code: 'CUS-1003',
    name: '远山食品加工厂',
    contactName: '郑凯',
    contactPhone: '0571-2233-9910',
    contactEmail: 'ops@yuanshan.example.test',
    address: '浙江省杭州市余杭区文一西路 998 号',
    level: 'normal',
  },
] as const;

interface SampleDevice {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly customerId: string;
  /** Account email of the responsible engineer. */
  readonly engineerEmail: string;
  readonly groupId: string;
  readonly location: string;
  readonly installDate: string;
  readonly warrantyUntil: string;
  /** Offset in days from today; a plan date in the past makes the device due. */
  readonly nextInspectionInDays: number;
  readonly inspectionCycleDays: number;
}

const DEVICE_ROWS: readonly SampleDevice[] = [
  {
    id: 'svc-factory-device-1',
    code: 'DEV-1001',
    name: '数控磨床',
    model: 'XG-200',
    serialNumber: 'XG200-2024-0001',
    customerId: 'svc-factory-customer-1',
    engineerEmail: 'engineer.li@example-service.test',
    groupId: TEAM_IDS.groupA,
    location: '苏州一车间 A 区',
    installDate: '2024-03-15',
    warrantyUntil: '2026-03-14',
    nextInspectionInDays: -1,
    inspectionCycleDays: 90,
  },
  {
    id: 'svc-factory-device-2',
    code: 'DEV-1002',
    name: '激光切割机',
    model: 'LC-3000',
    serialNumber: 'LC3000-2023-0117',
    customerId: 'svc-factory-customer-1',
    engineerEmail: 'engineer.zhao@example-service.test',
    groupId: TEAM_IDS.groupA,
    location: '苏州二车间 C 区',
    installDate: '2023-09-01',
    warrantyUntil: '2025-08-31',
    nextInspectionInDays: -2,
    inspectionCycleDays: 90,
  },
  {
    id: 'svc-factory-device-3',
    code: 'DEV-1003',
    name: '蒸汽灭菌器',
    model: 'MH-500',
    serialNumber: 'MH500-2025-0042',
    customerId: 'svc-factory-customer-2',
    engineerEmail: 'engineer.chen@example-service.test',
    groupId: TEAM_IDS.groupB,
    location: '上海浦东厂区 3 号楼',
    installDate: '2025-01-20',
    warrantyUntil: '2027-01-19',
    nextInspectionInDays: -5,
    inspectionCycleDays: 60,
  },
  {
    id: 'svc-factory-device-4',
    code: 'DEV-1004',
    name: '全自动灌装机',
    model: 'FG-90',
    serialNumber: 'FG90-2025-0008',
    customerId: 'svc-factory-customer-2',
    engineerEmail: 'engineer.chen@example-service.test',
    groupId: TEAM_IDS.groupB,
    location: '上海浦东厂区 4 号楼',
    installDate: '2025-06-11',
    warrantyUntil: '2027-06-10',
    nextInspectionInDays: 12,
    inspectionCycleDays: 90,
  },
  {
    id: 'svc-factory-device-5',
    code: 'DEV-1005',
    name: '工业冷水机组',
    model: 'CW-120',
    serialNumber: 'CW120-2022-0333',
    customerId: 'svc-factory-customer-3',
    engineerEmail: 'engineer.li@example-service.test',
    groupId: TEAM_IDS.groupA,
    location: '杭州余杭厂区动力间',
    installDate: '2022-11-05',
    warrantyUntil: '2024-11-04',
    nextInspectionInDays: -30,
    inspectionCycleDays: 180,
  },
];

interface SampleWorkOrder {
  readonly id: string;
  readonly orderNo: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly priority: 'normal' | 'urgent';
  readonly confidential: boolean;
  readonly source: 'manual' | 'external';
  readonly externalEventNo: string | null;
  readonly customerId: string | null;
  readonly deviceId: string | null;
  readonly groupId: string | null;
  /** Account email of the assignee, if any. */
  readonly assigneeEmail: string | null;
  /** Account email of the creator, if any. */
  readonly creatorEmail: string | null;
  readonly faultCategory: string | null;
  readonly reopenCount: number;
  readonly createdHoursAgo: number;
  /** The last activity; overdue is computed from this. */
  readonly updatedHoursAgo: number;
  readonly acceptedHoursAgo: number | null;
  readonly processingHoursAgo: number | null;
  readonly submittedHoursAgo: number | null;
  readonly confirmedHoursAgo: number | null;
  readonly closedHoursAgo: number | null;
  readonly closeSummary: string | null;
}

const WORK_ORDER_ROWS: readonly SampleWorkOrder[] = [
  {
    id: 'svc-factory-order-1',
    orderNo: 'WO-20260701-EX0001',
    title: '灭菌器压力异常报警',
    description: '设备平台上报：灭菌阶段压力持续高于设定值并触发报警。',
    status: 'pending_acceptance',
    priority: 'urgent',
    confidential: false,
    source: 'external',
    externalEventNo: 'EXT-20260701-0001',
    customerId: 'svc-factory-customer-2',
    deviceId: 'svc-factory-device-3',
    groupId: TEAM_IDS.groupB,
    assigneeEmail: null,
    creatorEmail: null,
    faultCategory: 'overheating',
    reopenCount: 0,
    createdHoursAgo: 14,
    updatedHoursAgo: 14,
    acceptedHoursAgo: null,
    processingHoursAgo: null,
    submittedHoursAgo: null,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-2',
    orderNo: 'WO-20260702-MN0002',
    title: '磨床主轴异响',
    description: '客户反馈主轴在 3000rpm 以上出现周期性异响。',
    status: 'pending_acceptance',
    priority: 'normal',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-1',
    deviceId: 'svc-factory-device-1',
    groupId: TEAM_IDS.groupA,
    assigneeEmail: null,
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'noise',
    reopenCount: 0,
    createdHoursAgo: 1,
    updatedHoursAgo: 1,
    acceptedHoursAgo: null,
    processingHoursAgo: null,
    submittedHoursAgo: null,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-3',
    orderNo: 'WO-20260703-MN0003',
    title: '激光切割机切割面粗糙',
    description: '切割 8mm 碳钢时断面出现明显挂渣。',
    status: 'pending_processing',
    priority: 'urgent',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-1',
    deviceId: 'svc-factory-device-2',
    groupId: TEAM_IDS.groupA,
    assigneeEmail: 'engineer.zhao@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'precision',
    reopenCount: 0,
    createdHoursAgo: 5,
    updatedHoursAgo: 3,
    acceptedHoursAgo: 3,
    processingHoursAgo: null,
    submittedHoursAgo: null,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-4',
    orderNo: 'WO-20260704-MN0004',
    title: '磨床冷却液渗漏',
    description: '冷却液从工作台下方渗漏，地面已有积液。',
    status: 'processing',
    priority: 'normal',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-1',
    deviceId: 'svc-factory-device-1',
    groupId: TEAM_IDS.groupA,
    assigneeEmail: 'engineer.li@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'leakage',
    reopenCount: 0,
    createdHoursAgo: 84,
    updatedHoursAgo: 80,
    acceptedHoursAgo: 80,
    processingHoursAgo: 76,
    submittedHoursAgo: null,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-5',
    orderNo: 'WO-20260705-MN0005',
    title: '灌装机计量偏差超差',
    description: '连续灌装偏差超过 ±1.5%，需要现场校准。',
    status: 'processing',
    priority: 'urgent',
    confidential: true,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-2',
    deviceId: 'svc-factory-device-4',
    groupId: TEAM_IDS.groupB,
    assigneeEmail: 'engineer.chen@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'precision',
    reopenCount: 0,
    createdHoursAgo: 11,
    updatedHoursAgo: 10,
    acceptedHoursAgo: 10,
    processingHoursAgo: 9,
    submittedHoursAgo: null,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-6',
    orderNo: 'WO-20260706-MN0006',
    title: '冷水机组压缩机高压保护',
    description: '压缩机频繁高压保护停机，需检查冷凝器与冷媒压力。',
    status: 'pending_confirmation',
    priority: 'normal',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-3',
    deviceId: 'svc-factory-device-5',
    groupId: TEAM_IDS.groupA,
    assigneeEmail: 'engineer.li@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'overheating',
    reopenCount: 0,
    createdHoursAgo: 52,
    updatedHoursAgo: 5,
    acceptedHoursAgo: 48,
    processingHoursAgo: 40,
    submittedHoursAgo: 5,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
  {
    id: 'svc-factory-order-7',
    orderNo: 'WO-20260707-MN0007',
    title: '激光切割机自动对焦失效',
    description: '自动对焦模块无法回到参考点，需更换传感器。',
    status: 'closed',
    priority: 'normal',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-1',
    deviceId: 'svc-factory-device-2',
    groupId: TEAM_IDS.groupA,
    assigneeEmail: 'engineer.zhao@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'sensor',
    reopenCount: 0,
    createdHoursAgo: 200,
    updatedHoursAgo: 100,
    acceptedHoursAgo: 190,
    processingHoursAgo: 180,
    submittedHoursAgo: 130,
    confirmedHoursAgo: 110,
    closedHoursAgo: 100,
    closeSummary: '更换对焦传感器并重新标定，连续 20 次对焦正常，客户已确认。',
  },
  {
    id: 'svc-factory-order-8',
    orderNo: 'WO-20260708-MN0008',
    title: '灌装机输送带跑偏',
    description: '首次维修后仍偶发跑偏，客户要求复检。',
    status: 'processing',
    priority: 'normal',
    confidential: false,
    source: 'manual',
    externalEventNo: null,
    customerId: 'svc-factory-customer-2',
    deviceId: 'svc-factory-device-4',
    groupId: TEAM_IDS.groupB,
    assigneeEmail: 'engineer.chen@example-service.test',
    creatorEmail: 'supervisor@example-service.test',
    faultCategory: 'mechanical',
    reopenCount: 1,
    createdHoursAgo: 96,
    updatedHoursAgo: 20,
    acceptedHoursAgo: 90,
    processingHoursAgo: 80,
    submittedHoursAgo: 60,
    confirmedHoursAgo: null,
    closedHoursAgo: null,
    closeSummary: null,
  },
];

interface SampleExecution {
  readonly action: string;
  readonly from: string | null;
  readonly to: string;
  readonly hoursAgo: number;
}

/** Lifecycle history for each sample order, so the detail log is not empty. */
const ORDER_HISTORY: Readonly<Record<string, readonly SampleExecution[]>> = {
  'svc-factory-order-1': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 14 },
  ],
  'svc-factory-order-2': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 1 },
  ],
  'svc-factory-order-3': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 5 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 3,
    },
  ],
  'svc-factory-order-4': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 84 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 80,
    },
    {
      action: 'start',
      from: 'pending_processing',
      to: 'processing',
      hoursAgo: 76,
    },
  ],
  'svc-factory-order-5': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 11 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 10,
    },
    {
      action: 'start',
      from: 'pending_processing',
      to: 'processing',
      hoursAgo: 9,
    },
    { action: 'share', from: 'processing', to: 'processing', hoursAgo: 8 },
  ],
  'svc-factory-order-6': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 52 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 48,
    },
    {
      action: 'start',
      from: 'pending_processing',
      to: 'processing',
      hoursAgo: 40,
    },
    {
      action: 'submit',
      from: 'processing',
      to: 'pending_confirmation',
      hoursAgo: 5,
    },
  ],
  'svc-factory-order-7': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 200 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 190,
    },
    {
      action: 'start',
      from: 'pending_processing',
      to: 'processing',
      hoursAgo: 180,
    },
    {
      action: 'submit',
      from: 'processing',
      to: 'pending_confirmation',
      hoursAgo: 130,
    },
    {
      action: 'confirm',
      from: 'pending_confirmation',
      to: 'pending_confirmation',
      hoursAgo: 110,
    },
    {
      action: 'close',
      from: 'pending_confirmation',
      to: 'closed',
      hoursAgo: 100,
    },
  ],
  'svc-factory-order-8': [
    { action: 'create', from: null, to: 'pending_acceptance', hoursAgo: 96 },
    {
      action: 'accept',
      from: 'pending_acceptance',
      to: 'pending_processing',
      hoursAgo: 90,
    },
    {
      action: 'start',
      from: 'pending_processing',
      to: 'processing',
      hoursAgo: 80,
    },
    {
      action: 'submit',
      from: 'processing',
      to: 'pending_confirmation',
      hoursAgo: 60,
    },
    {
      action: 'reject',
      from: 'pending_confirmation',
      to: 'processing',
      hoursAgo: 40,
    },
    {
      action: 'reopen',
      from: 'processing',
      to: 'pending_processing',
      hoursAgo: 20,
    },
  ],
};

/** Temporary read-only exceptions: two people outside the order's own team. */
const SHARE_ROWS = [
  {
    id: 'svc-factory-share-1',
    workOrderId: 'svc-factory-order-5',
    sharedWithEmail: 'observer@example-service.test',
    sharedByEmail: 'supervisor@example-service.test',
    note: '观察员需要复核计量偏差的处置记录。',
    expiresInHours: 72,
  },
  {
    id: 'svc-factory-share-2',
    workOrderId: 'svc-factory-order-6',
    sharedWithEmail: 'engineer.chen@example-service.test',
    sharedByEmail: 'engineer.li@example-service.test',
    note: '跨组支援，临时只读查阅冷水机组维修过程。',
    expiresInHours: 168,
  },
] as const;

const REPAIR_NOTE_ROWS = [
  {
    id: 'svc-factory-note-1',
    title: 'XG-200 磨床主轴异响的排查顺序',
    body: '先空载升速确认异响转速区间，再检查砂轮平衡与主轴轴承预紧力。若在 3000rpm 以上出现周期性异响，优先更换前轴承并复测振动值。',
    deviceModel: 'XG-200',
    faultCategory: 'noise',
    authorEmail: 'engineer.li@example-service.test',
    status: 'published',
    publishedDaysAgo: 12,
  },
  {
    id: 'svc-factory-note-2',
    title: 'MH-500 灭菌器压力报警处理要点',
    body: '压力持续偏高时先确认排气阀是否卡滞，再检查压力传感器零点。更换传感器后必须做一次空载灭菌循环确认曲线正常。',
    deviceModel: 'MH-500',
    faultCategory: 'overheating',
    authorEmail: 'engineer.chen@example-service.test',
    status: 'published',
    publishedDaysAgo: 5,
  },
  {
    id: 'svc-factory-note-3',
    title: 'LC-3000 切割面挂渣的参数调整记录',
    body: '8mm 碳钢挂渣时依次调整焦点位置、切割速度与辅助气压，本记录待现场第二次验证后发布。',
    deviceModel: 'LC-3000',
    faultCategory: 'precision',
    authorEmail: 'engineer.zhao@example-service.test',
    status: 'draft',
    publishedDaysAgo: null,
  },
] as const;

const MANUAL_ROWS = [
  {
    id: 'svc-factory-manual-1',
    title: 'XG-200 数控磨床操作与维护手册',
    modelName: 'XG-200',
    version: 'v2.3',
    docNo: 'DOC-XG200-2301',
    summary: '涵盖开机自检、砂轮更换、冷却系统维护与常见报警代码。',
    fileName: 'XG-200-操作维护手册-v2.3.docx',
    status: 'indexed',
    indexMessage: '已索引 46 个分段',
  },
  {
    id: 'svc-factory-manual-2',
    title: 'MH-500 蒸汽灭菌器安装调试手册',
    modelName: 'MH-500',
    version: 'v1.8',
    docNo: 'DOC-MH500-1802',
    summary: '安装条件、压力校验步骤与灭菌曲线判读。',
    fileName: 'MH-500-安装调试手册-v1.8.docx',
    status: 'published',
    indexMessage: null,
  },
  {
    id: 'svc-factory-manual-3',
    title: 'LC-3000 激光切割机参数手册',
    modelName: 'LC-3000',
    version: 'v4.1',
    docNo: 'DOC-LC3000-4100',
    summary: '不同材料厚度的焦点、功率与速度对照表。',
    fileName: 'LC-3000-参数手册-v4.1.docx',
    status: 'draft',
    indexMessage: null,
  },
] as const;

function hoursAgo(hours: number, now: Date): string {
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

function daysAgo(days: number, now: Date): string {
  return hoursAgo(days * 24, now);
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function offsetDay(offsetDays: number, now: Date): string {
  return dayString(new Date(now.getTime() + offsetDays * 86_400_000));
}

/** Seed rows are written by column name; the table's own constraints validate them. */
type SeedRecord = { id: string };

/**
 * Whether this application's own tables have been migrated in the database.
 *
 * One collection answers for all of them: the schema is created as a unit by the
 * application's migrations, so the first table is either there with the rest or
 * absent with them. Reads the resolved Collections rather than the physical
 * schema, so a table dropped outside a migration is still reported as absent.
 */
async function hasServiceSchema(database: DatabaseManager): Promise<boolean> {
  return Boolean(await database.collections().get(COLLECTIONS.customers));
}

/** Writes a row only when its id is absent, which is what makes a re-run a no-op. */
async function createIfAbsent(
  database: DatabaseManager,
  collection: string,
  id: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const repository = database.repository<SeedRecord>(collection);
  const existing = await repository.findOne({ filter: { id } });
  if (existing) return false;
  await repository.createOne({
    values: { ...values, id } as Partial<SeedRecord>,
  });
  return true;
}

export class ServiceDomainProvider extends ServiceProvider<Application> {
  readonly name = 'app/service';

  register(): void {
    const container = this.app.container;
    const database = container.resolve(databaseManagerToken);
    const app = this.app;

    container.singleton(serviceToken, (resolver) =>
      createService({
        database,
        orderNoPrefix: 'WO',
        publicBasePath: app.publicBasePath,
        assistant: () => readAssistantSettings(database),
        storeFile: async (file) => {
          if (!resolver.has(serverFileRepositoryManagerToken)) {
            throw new Error(
              'The File plugin is not registered, so an attachment cannot be stored.',
            );
          }
          const manager = resolver.resolve(serverFileRepositoryManagerToken);
          const repository = manager.repository(COLLECTIONS.serviceFiles, {
            disk: attachmentDisk(app),
            accessPath: ATTACHMENT_ACCESS_PATH,
            // The upload path composes every stored column itself. This
            // application writes the row through its own authenticated route
            // and publishes no action on the exposure.
            policy: { create: true, read: true, update: false, delete: false },
          });
          const { record } = await repository.uploadOne({ file });
          const stored: StoredFile = {
            id: String(record.id),
            filename: String(record.filename),
            ext: String(record.ext ?? ''),
            mimeType: String(record.mimeType ?? 'application/octet-stream'),
            size: Number(record.size ?? 0),
          };
          return stored;
        },
      }),
    );
  }

  async boot(): Promise<void> {
    const container = this.app.container;
    // The authorization plugin is optional at the runtime level: the template's
    // embedded-server tests start the application's providers with no plugins
    // loaded, and a domain that cannot describe itself to authorization simply
    // leaves the checks to that plugin when it is present.
    if (container.has(authorizationToken)) {
      registerServiceAuthorization(
        container.resolve(authorizationToken),
        container.resolve(databaseManagerToken),
      );
    }
    await this.registerScheduledTasks();
  }

  async start(): Promise<void> {
    const container = this.app.container;
    const database = container.resolve(databaseManagerToken);
    // The provider starts in applications that have no business schema, such as
    // the embedded-server tests built on a temporary root with no migrations,
    // and in runtimes assembled without the authentication and authorization
    // plugins. Provisioning there would only report a missing table or token, so
    // both are checked and provisioning is skipped when the application cannot
    // support it.
    if (
      !container.has(userAdministrationServiceToken) ||
      !container.has(authorizationToken) ||
      !(await hasServiceSchema(database))
    ) {
      return;
    }
    const accounts = await this.ensureAccounts(
      container.resolve(userAdministrationServiceToken),
    );
    await this.ensurePermissionSets();
    await this.ensureAccountPermissions(accounts);
    await this.ensureTeams(database, accounts);
    await this.ensureSampleData(database, accounts);
    await this.ensureSourceWorkflowsEnabled(database);
    if (process.env.NODE_ENV === 'production') {
      container
        .resolve(loggingToken)
        .getLogger('app/service')
        .warn(
          `Sample service accounts start with the known password "${SAMPLE_ACCOUNT_PASSWORD}". Change it before this application carries real work.`,
        );
    }
  }

  /**
   * Activates and enables the workflows this application ships.
   *
   * A deployment materializes each Artifact but deliberately leaves it neither
   * current nor enabled: choosing a revision is an administrator's decision,
   * and the Workflow management API is where that decision is made. This
   * application's acceptance workflow is not optional, though - the work-order
   * routes trigger it on every acceptance, and a disabled workflow would answer
   * `skipped`, silently turning every acceptance into a recorded failure. So the
   * first time a key is seen with no current revision it is activated and
   * enabled here, exactly as an administrator would through the management API.
   * A key that already has a current revision is left alone, so a later
   * `disable` is respected and is never undone by a restart.
   */
  private async ensureSourceWorkflowsEnabled(
    database: DatabaseManager,
  ): Promise<void> {
    const container = this.app.container;
    const workflow = container.has(workflowServiceToken)
      ? (container.resolve(workflowServiceToken) as unknown as {
          discoverArtifacts(): Promise<
            readonly { readonly key: string; readonly digest: string }[]
          >;
          ensureArtifactMaterialized(hash: string): Promise<unknown>;
        })
      : undefined;
    if (!workflow) return;
    let artifacts: readonly { readonly key: string; readonly digest: string }[];
    try {
      artifacts = await workflow.discoverArtifacts();
    } catch (error) {
      container
        .resolve(loggingToken)
        .getLogger('app/service')
        .warn(
          `Could not discover the application workflows: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      return;
    }
    const workflows = database.repository<{
      id: unknown;
      key: string;
      current: boolean | null;
      enabled: boolean;
    }>('workflows');
    for (const artifact of artifacts) {
      const current = await workflows.findOne({
        filter: { key: artifact.key, current: true },
        select: (select) => select.fields('id', 'enabled'),
      });
      if (current) continue;
      const workflowId = await workflow.ensureArtifactMaterialized(
        artifact.digest,
      );
      if (workflowId === undefined || workflowId === null) continue;
      await database.transaction(async (connection) => {
        const revisions = connection.repository<{
          id: unknown;
          key: string;
          current: boolean | null;
          enabled: boolean;
        }>('workflows');
        // One revision per key may be current, and a current revision is the
        // only one that may be enabled, so stale state is cleared first.
        await revisions.updateMany({
          filter: { key: artifact.key },
          values: { current: false, enabled: false },
        });
        await revisions.updateOne({
          filter: { id: workflowId as never },
          values: { current: true, enabled: true },
        });
      });
      container
        .resolve(loggingToken)
        .getLogger('app/service')
        .info(`Enabled the deployed workflow "${artifact.key}".`);
    }
  }

  /**
   * Registers the scheduler targets and their schedules.
   *
   * The scheduler package is imported dynamically so an application without it
   * still starts: the schedules are then absent, and the same work stays
   * reachable from the service operations page, which calls `runTask` directly.
   */
  private async registerScheduledTasks(): Promise<void> {
    const container = this.app.container;
    let tokens: typeof import('@nocobase/app-plugin-scheduler/server/tokens');
    try {
      tokens = await import('@nocobase/app-plugin-scheduler/server/tokens');
    } catch {
      return;
    }
    if (!container.has(tokens.schedulerServiceToken)) return;
    const scheduler = container.resolve(tokens.schedulerServiceToken);
    const run = async (key: string) => {
      const result = await container.resolve(serviceToken).runTask(key);
      return {
        state: 'completed' as const,
        outcome: 'succeeded' as const,
        result: {
          taskKey: result.key,
          runDate: result.runDate,
          createdCount: result.createdCount,
          pendingInspections: result.summary.pendingInspections,
          overdueOrders: result.summary.overdueOrders,
        },
      };
    };
    scheduler.registerTarget({
      type: TASK_TYPES.dailyInspections,
      title: 'Daily device inspections',
      validate: () => ({ valid: true }),
      start: () => run(RUN_KEYS.dailyInspections),
    });
    scheduler.registerTarget({
      type: TASK_TYPES.overdueReminders,
      title: 'Overdue work-order reminders',
      validate: () => ({ valid: true }),
      start: () => run(RUN_KEYS.overdueReminders),
    });
    for (const task of TASK_DEFINITIONS) {
      scheduler.defineSchedule({
        key: task.scheduleKey,
        // The scheduler stores one plain display string per definition; its
        // model has no translation key. The application's own operations page
        // shows the translated name from `task.titleKey`.
        title: TASK_TITLES[task.key] ?? task.key,
        description: TASK_DESCRIPTIONS[task.key],
        schedule: { cron: task.cron, timezone: task.timezone },
        target: { type: task.targetType, config: {} },
      });
    }
  }

  /** Creates the sample accounts once and returns them by email. */
  private async ensureAccounts(
    users: UserAdministrationService,
  ): Promise<Map<string, string>> {
    const accounts = new Map<string, string>();
    for (const account of SAMPLE_ACCOUNTS) {
      const existing = await users.list({
        search: account.email,
        pageSize: 20,
      });
      const match = existing.items.find((item) => item.email === account.email);
      if (match) {
        accounts.set(account.email, match.id);
        continue;
      }
      const created = await users.create({
        name: account.name,
        username: usernameFor(account.email),
        email: account.email,
        password: SAMPLE_ACCOUNT_PASSWORD,
      });
      accounts.set(account.email, created.id);
    }
    return accounts;
  }

  /**
   * Persists the declared permission sets.
   *
   * The definitions live in `resources.ts`; this writes only the ones that are
   * missing, so an administrator's later edits are never overwritten on the
   * next start.
   */
  private async ensurePermissionSets(): Promise<void> {
    const permissionSets =
      this.app.container.resolve(authorizationToken).permissionSets;
    for (const definition of servicePermissionSets) {
      const existing = await permissionSets.get(definition.key);
      if (!existing) await permissionSets.create(definition);
    }
  }

  /**
   * Assigns each sample account the permission set named by its job.
   *
   * This is the other half of `ensurePermissionSets`: a set with no assignment
   * grants nobody anything, so a fresh installation would show every sample
   * account being refused every business request. Checked before assigning, so a
   * restart never duplicates an assignment.
   */
  private async ensureAccountPermissions(
    accounts: Map<string, string>,
  ): Promise<void> {
    const permissionSets =
      this.app.container.resolve(authorizationToken).permissionSets;
    for (const account of SAMPLE_ACCOUNTS) {
      const userId = accounts.get(account.email);
      if (!userId) continue;
      const assignments = await permissionSets.listAssignments(
        account.permissionSet,
      );
      const already = assignments.some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      );
      if (already) continue;
      await permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet: account.permissionSet,
      });
    }
  }

  private async ensureTeams(
    database: DatabaseManager,
    accounts: Map<string, string>,
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const team of TEAM_ROWS) {
      await createIfAbsent(database, COLLECTIONS.serviceGroups, team.id, {
        code: team.code,
        name: team.name,
        description: team.description,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const account of SAMPLE_ACCOUNTS) {
      const userId = accounts.get(account.email);
      if (!userId) continue;
      for (const team of account.teams) {
        await createIfAbsent(
          database,
          COLLECTIONS.serviceGroupMembers,
          `svc-factory-member-${team.teamId}-${userId}`,
          {
            groupId: team.teamId,
            userId,
            memberRole: team.role,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
        );
      }
    }
  }

  /**
   * Installs the fictional business data, then runs both scheduled tasks once —
   * which is what puts today's inspections and today's reminders in the ledgers.
   */
  private async ensureSampleData(
    database: DatabaseManager,
    accounts: Map<string, string>,
  ): Promise<void> {
    const now = new Date();
    const nowIso = now.toISOString();
    const idOf = (email: string | null): string | null =>
      email ? (accounts.get(email) ?? null) : null;

    for (const customer of CUSTOMER_ROWS) {
      const { id: customerId, ...values } = customer;
      await createIfAbsent(database, COLLECTIONS.customers, customerId, {
        ...values,
        note: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    for (const device of DEVICE_ROWS) {
      await createIfAbsent(database, COLLECTIONS.devices, device.id, {
        code: device.code,
        name: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        customerId: device.customerId,
        serviceEngineerId: idOf(device.engineerEmail),
        groupId: device.groupId,
        location: device.location,
        installDate: device.installDate,
        warrantyUntil: device.warrantyUntil,
        nextInspectionDate: offsetDay(device.nextInspectionInDays, now),
        inspectionCycleDays: device.inspectionCycleDays,
        enabled: true,
        note: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    for (const order of WORK_ORDER_ROWS) {
      await createIfAbsent(database, COLLECTIONS.workOrders, order.id, {
        orderNo: order.orderNo,
        title: order.title,
        description: order.description,
        status: order.status,
        priority: order.priority,
        confidential: order.confidential,
        source: order.source,
        externalEventNo: order.externalEventNo,
        customerId: order.customerId,
        deviceId: order.deviceId,
        groupId: order.groupId,
        assigneeId: idOf(order.assigneeEmail),
        createdById: idOf(order.creatorEmail),
        faultCategory: order.faultCategory,
        acceptedAt: moment(order.acceptedHoursAgo, now),
        processingAt: moment(order.processingHoursAgo, now),
        submittedAt: moment(order.submittedHoursAgo, now),
        confirmedAt: moment(order.confirmedHoursAgo, now),
        closedAt: moment(order.closedHoursAgo, now),
        closeSummary: order.closeSummary,
        failureReason: null,
        reopenCount: order.reopenCount,
        createdAt: hoursAgo(order.createdHoursAgo, now),
        updatedAt: hoursAgo(order.updatedHoursAgo, now),
      });

      const history = ORDER_HISTORY[order.id] ?? [];
      for (const [index, step] of history.entries()) {
        await createIfAbsent(
          database,
          COLLECTIONS.workOrderExecutions,
          `${order.id}-history-${index + 1}`,
          {
            workOrderId: order.id,
            action: step.action,
            fromStatus: step.from,
            toStatus: step.to,
            operatorId: idOf(order.assigneeEmail) ?? idOf(order.creatorEmail),
            idempotencyKey:
              step.action === 'create'
                ? null
                : `svc-factory:${order.id}:${step.action}`,
            result: 'succeeded',
            failureReason: null,
            detail: step.action === 'close' ? order.closeSummary : null,
            attempt: 1,
            createdAt: hoursAgo(step.hoursAgo, now),
          },
        );
      }
    }

    for (const share of SHARE_ROWS) {
      await createIfAbsent(database, COLLECTIONS.workOrderShares, share.id, {
        workOrderId: share.workOrderId,
        sharedWithId: idOf(share.sharedWithEmail),
        sharedById: idOf(share.sharedByEmail),
        note: share.note,
        expiresAt: hoursAgo(-share.expiresInHours, now),
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    for (const note of REPAIR_NOTE_ROWS) {
      await createIfAbsent(database, COLLECTIONS.repairNotes, note.id, {
        title: note.title,
        body: note.body,
        deviceModel: note.deviceModel,
        faultCategory: note.faultCategory,
        authorId: idOf(note.authorEmail),
        status: note.status,
        publishedAt:
          note.publishedDaysAgo === null
            ? null
            : daysAgo(note.publishedDaysAgo, now),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    for (const manual of MANUAL_ROWS) {
      await createIfAbsent(database, COLLECTIONS.deviceManuals, manual.id, {
        title: manual.title,
        modelName: manual.modelName,
        version: manual.version,
        docNo: manual.docNo,
        summary: manual.summary,
        fileKey: `manuals/${manual.fileName}`,
        fileName: manual.fileName,
        status: manual.status,
        indexMessage: manual.indexMessage,
        publishedAt: manual.status === 'draft' ? null : daysAgo(7, now),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // Completed inspection history, so the list is more than what the generator
    // created this morning.
    const history = [
      {
        deviceId: 'svc-factory-device-1',
        assigneeEmail: 'engineer.li@example-service.test',
        days: 92,
        result: 'normal',
        remark: '振动值 1.8mm/s，在允许范围内。',
      },
      {
        deviceId: 'svc-factory-device-3',
        assigneeEmail: 'engineer.chen@example-service.test',
        days: 62,
        result: 'abnormal',
        remark: '压力表指针抖动，已更换压力表并复测通过。',
      },
      {
        deviceId: 'svc-factory-device-5',
        assigneeEmail: 'engineer.li@example-service.test',
        days: 181,
        result: 'normal',
        remark: '冷凝器清洗完成，冷媒压力正常。',
      },
    ];
    for (const [index, task] of history.entries()) {
      const planDate = offsetDay(-task.days, now);
      await createIfAbsent(
        database,
        COLLECTIONS.inspectionTasks,
        `svc-factory-inspection-${index + 1}`,
        {
          deviceId: task.deviceId,
          assigneeId: idOf(task.assigneeEmail),
          planDate,
          status: 'completed',
          result: task.result,
          remark: task.remark,
          completedAt: `${planDate}T09:30:00.000Z`,
          createdAt: `${planDate}T00:10:00.000Z`,
          updatedAt: `${planDate}T09:30:00.000Z`,
        },
      );
    }

    // The real generators run now: today's inspection tasks for every device
    // whose plan date has arrived, one reminder per overdue order, and the
    // `scheduledRuns` ledger rows the operations page reads. Both are idempotent
    // per calendar day.
    const service = this.app.container.resolve(serviceToken);
    const log = this.app.container
      .resolve(loggingToken)
      .getLogger('app/service');
    for (const task of TASK_DEFINITIONS) {
      try {
        await service.runTask(task.key);
      } catch (error) {
        log.warn(
          { error },
          `Scheduled task ${task.key} failed during provisioning`,
        );
      }
    }
    await completeTodayInspection(database, 'svc-factory-device-5', now);
  }
}

function moment(hours: number | null, now: Date): string | null {
  return hours === null ? null : hoursAgo(hours, now);
}

/** Usernames must be stable and URL-safe; the email local part may contain dots. */
function usernameFor(email: string): string {
  return `svc.${email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase()}`;
}

const TASK_TITLES: Readonly<Record<string, string>> = {
  [RUN_KEYS.dailyInspections]: 'Daily device inspections',
  [RUN_KEYS.overdueReminders]: 'Overdue work-order reminders',
};

const TASK_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [RUN_KEYS.dailyInspections]:
    'Create one inspection task per device whose plan date has arrived.',
  [RUN_KEYS.overdueReminders]:
    'Record one in-app reminder per open order that has passed its response budget.',
};

/** Completes today's inspection task for one device, when it is still pending. */
async function completeTodayInspection(
  database: DatabaseManager,
  deviceId: string,
  now: Date,
): Promise<void> {
  const repository = database.repository<InspectionTask>(
    COLLECTIONS.inspectionTasks,
  );
  const task = await repository.findOne({
    filter: (f) =>
      f.and([
        f.string('deviceId').eq(deviceId),
        f.date('planDate').on(dayString(now)),
      ]),
  });
  if (!task || task.status !== 'pending') return;
  await repository.updateOne({
    filter: { id: task.id },
    values: {
      status: 'completed',
      result: 'normal',
      remark: '例行点检：运行声音正常，出水温度 42°C。',
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
}

/**
 * The disk uploaded attachment bytes are written to: the application's default
 * disk, which is the private local one. The exposure serves that same disk.
 */
function attachmentDisk(app: Application): string {
  const drive = app.config.get<{ readonly default?: string }>('drive');
  return drive?.default ?? 'local';
}

/**
 * Reads whether the AI plugins are configured enough for the order assistant to
 * answer: an enabled LLM service and at least one knowledge base.
 *
 * Best-effort by design. The tables belong to optional plugins, so an
 * application without them reports "not configured" instead of failing.
 */
async function readAssistantSettings(
  database: DatabaseManager,
): Promise<AssistantSettings> {
  const knowledgeBase = await readKnowledgeBase(database);
  try {
    const service = await database
      .query()
      .selectFrom('llmServices')
      .select(['name', 'provider', 'enabledModels'])
      .where('enabled', '=', true)
      .orderBy('name')
      .limit(1)
      .executeTakeFirst();
    if (!service) {
      return {
        model: { configured: false, provider: null, model: null },
        knowledgeBase,
      };
    }
    const models = (
      service.enabledModels as {
        readonly models?: readonly unknown[];
      } | null
    )?.models;
    const first = models?.find(
      (entry): entry is string => typeof entry === 'string',
    );
    return {
      model: {
        configured: true,
        provider:
          typeof service.provider === 'string' ? service.provider : null,
        model:
          first ?? (typeof service.name === 'string' ? service.name : null),
      },
      knowledgeBase,
    };
  } catch {
    return {
      model: { configured: false, provider: null, model: null },
      knowledgeBase,
    };
  }
}

async function readKnowledgeBase(
  database: DatabaseManager,
): Promise<AssistantSettings['knowledgeBase']> {
  try {
    const manifests = await database
      .query()
      .selectFrom('aiKnowledgeBaseManifests')
      .select((builder) => [builder.fn.countAll().as('count')])
      .executeTakeFirst();
    const count = Number(manifests?.count ?? 0);
    return {
      configured: count > 0,
      vectorDatabase: null,
      manifestCount: count,
    };
  } catch {
    return { configured: false, vectorDatabase: null, manifestCount: 0 };
  }
}

/** Stated here and in the README, so the review instructions cannot drift. */
export { SAMPLE_ACCOUNT_PASSWORD, SAMPLE_ACCOUNTS };
