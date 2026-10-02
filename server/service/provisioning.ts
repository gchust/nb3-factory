import type { DatabaseConnection } from '@nocobase/db';

import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { PermissionSetsApi } from '@nocobase/authorization/permission-sets';

import {
  INSPECTION_STATUS,
  SERVICE_PERMISSION_SET,
  WORK_ORDER_EVENT,
  WORK_ORDER_PRIORITY,
  WORK_ORDER_STATUS,
} from './constants.js';
import type {
  ServiceCustomerRow,
  ServiceEngineerGroupRow,
  ServiceEngineerProfileRow,
  ServiceEquipmentRow,
  ServiceExternalEventRow,
  ServiceInspectionRow,
  ServiceManualRow,
  ServiceRepairKnowledgeRow,
  ServiceWorkOrderEventRow,
  ServiceWorkOrderRow,
  ServiceWorkOrderShareRow,
} from './models.js';
import { servicePermissionSetDefinitions } from './permission-sets.js';

/**
 * Idempotent first-run provisioning for the service desk.
 *
 * The application has to start on an empty database and still be usable, so the demo accounts, the four
 * permission sets and a small amount of sample business data are created here instead of in a seed. A database
 * seed runs while the database provider boots, before authentication and authorization have registered, and
 * therefore cannot hash a password or resolve a permission set — the two things the demo accounts need.
 *
 * Every step checks for what it is about to create. Permission sets are created only when absent, so an
 * administrator's later edits survive; a demo account is assigned a role only when this routine created it, so
 * an assignment an administrator removed is never re-added. Sample rows are only written when their table is
 * empty.
 *
 * Demonstration sign-in: every created account shares the password in `SERVICE_DEMO_PASSWORD`. The supervisor
 * account is `supervisor@service.example.com`; the integration account `integration@service.example.com` signs
 * in the same way until an administrator issues it an API key from Settings → API Keys.
 */

/** Password every demo account is created with. It is a demonstration credential, not a deployment secret. */
export const SERVICE_DEMO_PASSWORD = 'Service@2026';

export interface ProvisioningLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ServiceProvisioningOptions {
  readonly connection: DatabaseConnection;
  readonly users: UserAdministrationService;
  readonly permissionSets: PermissionSetsApi;
  readonly logger: ProvisioningLogger;
}

interface DemoAccount {
  readonly name: string;
  readonly email: string;
  readonly username: string;
  readonly set: string;
  /** The group the engineer belongs to; absent for non-engineer accounts. */
  readonly groupCode?: string;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: '王主管',
    email: 'supervisor@service.example.com',
    username: 'service.supervisor',
    set: SERVICE_PERMISSION_SET.SUPERVISOR,
  },
  {
    name: '张伟',
    email: 'zhang.wei@service.example.com',
    username: 'service.zhang',
    set: SERVICE_PERMISSION_SET.ENGINEER,
    groupCode: 'SVC-A',
  },
  {
    name: '李娜',
    email: 'li.na@service.example.com',
    username: 'service.li',
    set: SERVICE_PERMISSION_SET.ENGINEER,
    groupCode: 'SVC-A',
  },
  {
    name: '王强',
    email: 'wang.qiang@service.example.com',
    username: 'service.wang',
    set: SERVICE_PERMISSION_SET.ENGINEER,
    groupCode: 'SVC-B',
  },
  {
    name: '赵敏',
    email: 'zhao.min@service.example.com',
    username: 'service.zhao',
    set: SERVICE_PERMISSION_SET.ENGINEER,
    groupCode: 'SVC-B',
  },
  {
    name: '陈观察',
    email: 'observer@service.example.com',
    username: 'service.observer',
    set: SERVICE_PERMISSION_SET.OBSERVER,
  },
  {
    name: '设备平台集成',
    email: 'integration@service.example.com',
    username: 'service.integration',
    set: SERVICE_PERMISSION_SET.INTEGRATOR,
  },
];

function now(): Date {
  return new Date();
}

function startOfToday(): Date {
  const current = new Date();
  return new Date(
    Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
    ),
  );
}

function withinDays(days: number): Date {
  return new Date(startOfToday().getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Creates the four code-owned permission sets when they are missing. An existing set is left exactly as it is,
 * including its grants and its assignments.
 */
async function ensurePermissionSets(
  permissionSets: PermissionSetsApi,
  logger: ProvisioningLogger,
): Promise<void> {
  for (const build of servicePermissionSetDefinitions) {
    const definition = build();
    const existing = await permissionSets.get(definition.key);
    if (existing) continue;
    await permissionSets.create({
      key: definition.key,
      title: definition.title,
      grants: definition.grants,
    });
    logger.info(`Created permission set ${definition.key}.`);
  }
}

async function findByEmail(
  users: UserAdministrationService,
  email: string,
): Promise<{ id: string } | undefined> {
  const needle = email.toLowerCase();
  const page = await users.list({ search: email, pageSize: 50 });
  const match = page.items.find((item) => item.email.toLowerCase() === needle);
  return match ? { id: match.id } : undefined;
}

/** Creates the demonstration accounts that are missing and assigns each new account its permission set. */
async function ensureDemoAccounts(
  users: UserAdministrationService,
  permissionSets: PermissionSetsApi,
  logger: ProvisioningLogger,
): Promise<void> {
  let created = 0;
  for (const account of DEMO_ACCOUNTS) {
    const existing = await findByEmail(users, account.email);
    if (existing) continue;
    const user = await users.create({
      name: account.name,
      email: account.email,
      username: account.username,
      password: SERVICE_DEMO_PASSWORD,
    });
    await permissionSets.assign({
      subject: { type: 'user', id: user.id },
      permissionSet: account.set,
    });
    created += 1;
  }
  if (created > 0) {
    logger.info(`Created ${created} demonstration service accounts.`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(
        `Demonstration accounts: ${DEMO_ACCOUNTS.map((account) => account.email).join(', ')} (password ${SERVICE_DEMO_PASSWORD}).`,
      );
    }
  }
}

/** Every demo account that exists, keyed by username. */
async function resolveDemoAccounts(
  users: UserAdministrationService,
): Promise<Record<string, string>> {
  const byUsername: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const existing = await findByEmail(users, account.email);
    if (existing) byUsername[account.username] = existing.id;
  }
  return byUsername;
}

interface DemoEquipment {
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly location: string;
  readonly customer: number;
  readonly engineer: number;
  readonly enabled: boolean;
  readonly nextInspectionInDays: number | null;
}

const DEMO_CUSTOMERS = [
  {
    name: '北京精工制造有限公司',
    code: 'CUST-001',
    level: 'vip',
    contact: '刘经理',
    phone: '010-8888-1001',
    address: '北京市大兴区经济技术开发区',
  },
  {
    name: '上海恒力重工股份有限公司',
    code: 'CUST-002',
    level: 'standard',
    contact: '孙主任',
    phone: '021-6666-2002',
    address: '上海市浦东新区金桥工业园',
  },
  {
    name: '广州华南电子科技有限公司',
    code: 'CUST-003',
    level: 'standard',
    contact: '周工',
    phone: '020-5555-3003',
    address: '广州市黄埔区科学城',
  },
] as const;

const DEMO_EQUIPMENT: readonly DemoEquipment[] = [
  {
    code: 'EQ-1001',
    name: '数控加工中心',
    model: 'VMC-850',
    serialNumber: 'SN-2022-0001',
    location: '北京精工 A 车间',
    customer: 0,
    engineer: 0,
    enabled: true,
    nextInspectionInDays: 0,
  },
  {
    code: 'EQ-1002',
    name: '激光切割机',
    model: 'LC-3015',
    serialNumber: 'SN-2022-0002',
    location: '北京精工 B 车间',
    customer: 0,
    engineer: 0,
    enabled: true,
    nextInspectionInDays: -3,
  },
  {
    code: 'EQ-2001',
    name: '工业机器人',
    model: 'IR-1600',
    serialNumber: 'SN-2023-0101',
    location: '上海恒力 装配线',
    customer: 1,
    engineer: 1,
    enabled: true,
    nextInspectionInDays: 0,
  },
  {
    code: 'EQ-2002',
    name: '液压冲床',
    model: 'HP-200T',
    serialNumber: 'SN-2023-0102',
    location: '上海恒力 冲压车间',
    customer: 1,
    engineer: 1,
    enabled: true,
    nextInspectionInDays: 5,
  },
  {
    code: 'EQ-3001',
    name: '自动贴片机',
    model: 'SMT-800',
    serialNumber: 'SN-2024-0201',
    location: '广州华南 电子车间',
    customer: 2,
    engineer: 2,
    enabled: true,
    nextInspectionInDays: 0,
  },
  {
    code: 'EQ-3002',
    name: '回流焊炉',
    model: 'RF-1200',
    serialNumber: 'SN-2024-0202',
    location: '广州华南 电子车间',
    customer: 2,
    engineer: 3,
    enabled: false,
    nextInspectionInDays: null,
  },
];

const DEMO_KNOWLEDGE = [
  {
    title: '数控加工中心主轴异响排查',
    category: '机械',
    tags: '主轴,异响,轴承',
    symptom: '主轴运转时出现周期性异响。',
    content: '依次检查轴承间隙、润滑状态与拉刀机构，必要时更换轴承。',
    published: true,
    viewCount: 12,
  },
  {
    title: '激光切割机切割面挂渣处理',
    category: '工艺',
    tags: '激光,挂渣,气压',
    symptom: '切割边缘出现挂渣。',
    content: '提高辅助气压，检查喷嘴同轴度并调整焦点位置。',
    published: true,
    viewCount: 8,
  },
  {
    title: '工业机器人示教器通讯中断（草稿）',
    category: '电控',
    tags: '机器人,通讯',
    symptom: '示教器偶发失去连接。',
    content: '草稿：待确认是线缆还是控制柜接口问题。',
    published: false,
    viewCount: 0,
  },
] as const;

const DEMO_MANUALS = [
  {
    title: 'VMC-850 数控加工中心操作手册',
    version: '2.1',
    equipment: 0,
    summary: '开机、对刀、日常保养与安全注意事项。',
    content:
      '# VMC-850 操作手册\n\n## 1. 安全规范\n\n- 开机前确认防护门关闭、急停按钮复位。\n- 主轴运转时禁止打开防护门。\n\n## 2. 开机与回零\n\n1. 合上总电源，等待系统自检。\n2. 执行回零，确认三轴回到参考点。\n\n## 3. 对刀\n\n使用寻边器确定工件原点，并记录到刀补表。\n\n## 4. 日常保养\n\n- 每班清理切屑并检查切削液液位。\n- 每周润滑导轨与丝杠。\n',
    published: true,
  },
  {
    title: 'SMT-800 自动贴片机维护手册',
    version: '1.4',
    equipment: 4,
    summary: '吸嘴清洁、供料器校准与轨道保养周期。',
    content:
      '# SMT-800 维护手册\n\n## 1. 吸嘴清洁\n\n每 8 小时用专用通针清理吸嘴，检查真空值是否达标。\n\n## 2. 供料器校准\n\n更换供料器后重新示教取料位置，试贴 5 片确认无偏移。\n\n## 3. 导轨保养\n\n每周清洁导轨并加注润滑脂，检查传送带张力。\n\n## 4. 常见报警\n\n- 吸嘴堵塞：清洁吸嘴并复测真空。\n',
    published: true,
  },
  {
    title: 'IR-1600 工业机器人调试手册（草稿）',
    version: '0.9',
    equipment: 2,
    summary: '零点标定与安全围栏配置，尚未发布。',
    content:
      '# IR-1600 调试手册（草稿）\n\n## 1. 零点标定\n\n按制造商流程逐轴标定并备份参数。\n\n## 2. 安全围栏\n\n确认安全门联锁与光幕动作正常。\n',
    published: false,
  },
] as const;

interface DemoWorkOrder {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly equipmentCode: string;
  readonly priority: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly confidential: boolean;
  readonly deadlineInDays: number | null;
  readonly source: string;
  readonly externalEventId?: string;
}

/**
 * Writes the sample ledger when the corresponding table is empty: groups and engineer links, then customers and
 * equipment, then work orders with an event each, inspections, knowledge and manuals. The work orders cover
 * every status of the closed loop, one confidential order and one overdue order, so the dashboard and the
 * permission scopes have something to show.
 */
async function ensureSampleData(
  connection: DatabaseConnection,
  accountIds: Record<string, string>,
  logger: ProvisioningLogger,
): Promise<void> {
  const timestamp = now();

  const groups = connection.repository<ServiceEngineerGroupRow>(
    'serviceEngineerGroups',
  );
  if ((await groups.count()) === 0) {
    for (const group of [
      { code: 'SVC-A', name: '服务甲组' },
      { code: 'SVC-B', name: '服务乙组' },
    ]) {
      await groups.createOne({
        values: { ...group, createdAt: timestamp, updatedAt: timestamp },
      });
    }
    logger.info('Created the two demonstration engineer groups.');
  }
  const groupRows = await groups.findMany({});
  const groupIdByCode = new Map(groupRows.map((row) => [row.code, row.id]));

  const profiles = connection.repository<ServiceEngineerProfileRow>(
    'serviceEngineerProfiles',
  );
  if ((await profiles.count()) === 0) {
    for (const account of DEMO_ACCOUNTS) {
      if (!account.groupCode) continue;
      const userId = accountIds[account.username];
      const groupId = groupIdByCode.get(account.groupCode);
      if (!userId || groupId === undefined) continue;
      await profiles.createOne({
        values: { userId, groupId, createdAt: timestamp, updatedAt: timestamp },
      });
    }
    logger.info('Linked the demonstration engineers to their groups.');
  }

  const customers =
    connection.repository<ServiceCustomerRow>('serviceCustomers');
  if ((await customers.count()) === 0) {
    for (const customer of DEMO_CUSTOMERS) {
      await customers.createOne({
        values: { ...customer, createdAt: timestamp, updatedAt: timestamp },
      });
    }
    logger.info('Created demonstration customers.');
  }
  const customerRows = await customers.findMany({
    sort: (sort) => sort.field('id').asc(),
  });

  const equipment =
    connection.repository<ServiceEquipmentRow>('serviceEquipment');
  if ((await equipment.count()) === 0) {
    const engineerAccounts = DEMO_ACCOUNTS.filter(
      (account) => account.groupCode !== undefined,
    );
    for (const item of DEMO_EQUIPMENT) {
      const customer = customerRows[item.customer];
      if (!customer) continue;
      const engineerAccount = engineerAccounts[item.engineer];
      const engineerId = engineerAccount
        ? accountIds[engineerAccount.username]
        : undefined;
      await equipment.createOne({
        values: {
          code: item.code,
          name: item.name,
          model: item.model,
          serialNumber: item.serialNumber,
          location: item.location,
          status: 'active',
          customerId: customer.id,
          engineerId: engineerId ?? null,
          enabled: item.enabled,
          nextInspectionDate:
            item.nextInspectionInDays === null
              ? null
              : withinDays(item.nextInspectionInDays),
          warrantyUntil: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
    logger.info('Created demonstration equipment.');
  }
  const equipmentRows = await equipment.findMany({
    sort: (sort) => sort.field('id').asc(),
  });
  const equipmentByCode = new Map(equipmentRows.map((row) => [row.code, row]));

  const supervisorId = accountIds['service.supervisor'] ?? null;
  const zhang = accountIds['service.zhang'];
  const li = accountIds['service.li'];
  const wang = accountIds['service.wang'];

  const workOrders =
    connection.repository<ServiceWorkOrderRow>('serviceWorkOrders');
  if ((await workOrders.count()) === 0) {
    const definitions: readonly DemoWorkOrder[] = [
      {
        code: 'SRV-DEMO-0001',
        title: '数控加工中心主轴异响',
        description: '操作工反馈主轴启动后出现周期性异响，需要现场排查。',
        equipmentCode: 'EQ-1001',
        priority: WORK_ORDER_PRIORITY.HIGH,
        status: WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
        assigneeId: null,
        confidential: false,
        deadlineInDays: 2,
        source: 'internal',
      },
      {
        code: 'SRV-DEMO-0002',
        title: '激光切割机切割面挂渣',
        description: '切割碳钢时下边缘出现明显挂渣，需调整工艺参数。',
        equipmentCode: 'EQ-1002',
        priority: WORK_ORDER_PRIORITY.NORMAL,
        status: WORK_ORDER_STATUS.PENDING_PROCESSING,
        assigneeId: zhang ?? null,
        confidential: false,
        deadlineInDays: 3,
        source: 'internal',
      },
      {
        code: 'SRV-DEMO-0003',
        title: '工业机器人定位偏差',
        description:
          '机器人取放料出现毫米级偏差，涉及客户机密工艺，仅限相关人员。',
        equipmentCode: 'EQ-2001',
        priority: WORK_ORDER_PRIORITY.URGENT,
        status: WORK_ORDER_STATUS.PROCESSING,
        assigneeId: li ?? null,
        confidential: true,
        deadlineInDays: -1,
        source: 'internal',
      },
      {
        code: 'SRV-DEMO-0004',
        title: '液压冲床压力不足',
        description: '冲床压力达不到设定值，已更换密封件，等待客户确认。',
        equipmentCode: 'EQ-2002',
        priority: WORK_ORDER_PRIORITY.NORMAL,
        status: WORK_ORDER_STATUS.PENDING_CONFIRMATION,
        assigneeId: li ?? null,
        confidential: false,
        deadlineInDays: 1,
        source: 'internal',
      },
      {
        code: 'SRV-DEMO-0005',
        title: '自动贴片机吸嘴堵塞',
        description: '吸嘴频繁堵塞导致抛料率升高，已清洁并校准供料器。',
        equipmentCode: 'EQ-3001',
        priority: WORK_ORDER_PRIORITY.LOW,
        status: WORK_ORDER_STATUS.CLOSED,
        assigneeId: wang ?? null,
        confidential: false,
        deadlineInDays: -5,
        source: 'internal',
      },
      {
        code: 'SRV-DEMO-0006',
        title: '外部平台上报：回流焊炉温异常',
        description: '设备平台上报炉温曲线异常，需要工程师确认。',
        equipmentCode: 'EQ-3002',
        priority: WORK_ORDER_PRIORITY.URGENT,
        status: WORK_ORDER_STATUS.PENDING_ACCEPTANCE,
        assigneeId: null,
        confidential: false,
        deadlineInDays: 1,
        source: 'external',
        externalEventId: 'EXT-PLATFORM-1001',
      },
    ];

    for (const definition of definitions) {
      const equipmentRow = equipmentByCode.get(definition.equipmentCode);
      if (!equipmentRow) continue;
      const created = await workOrders.createOne({
        values: {
          code: definition.code,
          title: definition.title,
          source: definition.source,
          reporterId: supervisorId,
          customerId: equipmentRow.customerId,
          equipmentId: equipmentRow.id,
          description: definition.description,
          priority: definition.priority,
          confidential: definition.confidential,
          deadline:
            definition.deadlineInDays === null
              ? null
              : withinDays(definition.deadlineInDays),
          assigneeId: definition.assigneeId,
          supervisorId,
          status: definition.status,
          acceptanceNote: null,
          resolutionNote: null,
          returnReason: null,
          acceptedAt: null,
          startedAt: null,
          submittedAt: null,
          closedAt: null,
          externalEventId: definition.externalEventId ?? null,
          createdById: supervisorId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      const events = connection.repository<ServiceWorkOrderEventRow>(
        'serviceWorkOrderEvents',
      );
      await events.createOne({
        values: {
          workOrderId: created.record.id,
          type: WORK_ORDER_EVENT.CREATED,
          status: 'succeeded',
          message: '演示工单已创建。',
          detail: null,
          actorId: supervisorId,
          createdAt: timestamp,
        },
      });
    }

    // One open collaboration: the non-confidential pending work order is shared with a second engineer.
    const pending = await workOrders.findOne({
      filter: { code: 'SRV-DEMO-0002' },
    });
    if (pending && li) {
      const shares = connection.repository<ServiceWorkOrderShareRow>(
        'serviceWorkOrderShares',
      );
      await shares.createOne({
        values: {
          workOrderId: pending.id,
          engineerId: li,
          grantedById: supervisorId,
          revokedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }

    logger.info('Created demonstration work orders.');
  }

  const inspections =
    connection.repository<ServiceInspectionRow>('serviceInspections');
  if ((await inspections.count()) === 0) {
    const planDate = startOfToday();
    const targets: readonly [string, string | null, string][] = [
      ['EQ-1001', zhang ?? null, INSPECTION_STATUS.PENDING],
      ['EQ-2001', li ?? null, INSPECTION_STATUS.PENDING],
      ['EQ-3001', wang ?? null, INSPECTION_STATUS.DONE],
    ];
    let sequence = 1;
    for (const [code, assigneeId, status] of targets) {
      const equipmentRow = equipmentByCode.get(code);
      if (!equipmentRow) continue;
      await inspections.createOne({
        values: {
          equipmentId: equipmentRow.id,
          code: `INS-DEMO-${String(sequence).padStart(4, '0')}`,
          planDate,
          dueDate: new Date(planDate.getTime() + 24 * 60 * 60 * 1000),
          assigneeId,
          status,
          result: status === INSPECTION_STATUS.DONE ? '设备运行正常。' : null,
          completedAt: status === INSPECTION_STATUS.DONE ? timestamp : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      sequence += 1;
    }
    logger.info('Created demonstration inspections.');
  }

  const knowledge = connection.repository<ServiceRepairKnowledgeRow>(
    'serviceRepairKnowledge',
  );
  if ((await knowledge.count()) === 0) {
    for (const item of DEMO_KNOWLEDGE) {
      await knowledge.createOne({
        values: {
          ...item,
          createdById: supervisorId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
    logger.info('Created demonstration repair knowledge.');
  }

  const manuals = connection.repository<ServiceManualRow>('serviceManuals');
  if ((await manuals.count()) === 0) {
    for (const item of DEMO_MANUALS) {
      const equipmentRow = equipmentRows[item.equipment];
      if (!equipmentRow) continue;
      await manuals.createOne({
        values: {
          title: item.title,
          version: item.version,
          equipmentId: equipmentRow.id,
          summary: item.summary,
          content: item.content,
          driveKey: null,
          filename: null,
          published: item.published,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
    logger.info('Created demonstration manuals.');
  }

  const externalEvents = connection.repository<ServiceExternalEventRow>(
    'serviceExternalEvents',
  );
  if ((await externalEvents.count()) === 0) {
    const external = await workOrders.findOne({
      filter: { externalEventId: 'EXT-PLATFORM-1001' },
    });
    if (external) {
      await externalEvents.createOne({
        values: {
          externalEventId: 'EXT-PLATFORM-1001',
          source: 'equipment-platform',
          eventType: 'temperature',
          status: 'accepted',
          message: '温度曲线超出阈值。',
          workOrderId: external.id,
          payload: { peak: 268, threshold: 250 },
          createdAt: timestamp,
        },
      });
      const events = connection.repository<ServiceWorkOrderEventRow>(
        'serviceWorkOrderEvents',
      );
      await events.createOne({
        values: {
          workOrderId: external.id,
          type: WORK_ORDER_EVENT.INTEGRATION_INGESTED,
          status: 'succeeded',
          message: 'Work order received from the equipment platform.',
          detail: { externalEventId: 'EXT-PLATFORM-1001' },
          actorId: accountIds['service.integration'] ?? null,
          createdAt: timestamp,
        },
      });
    }
  }
}

/**
 * Runs every provisioning step in dependency order. A failure is reported and swallowed by the caller so a
 * provisioning problem cannot stop the application from starting; the next boot retries what did not finish.
 */
export async function provisionServiceLedger(
  options: ServiceProvisioningOptions,
): Promise<void> {
  const { connection, users, permissionSets, logger } = options;
  await ensurePermissionSets(permissionSets, logger);
  await ensureDemoAccounts(users, permissionSets, logger);
  const accountIds = await resolveDemoAccounts(users);
  await ensureSampleData(connection, accountIds, logger);
}
