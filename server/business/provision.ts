import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import { SERVICE_ROLE, type ServiceRole } from '../services/access.js';
import {
  SERVICE_ROLE_DEFINITIONS,
  buildPermissionSet,
} from './permission-config.js';
import { WORK_ORDER_STATUS } from './work-order-state.js';
import type {
  CustomerRow,
  DeviceRow,
  WorkOrderRow,
  InspectionRow,
  KnowledgeArticleRow,
  DeviceManualRow,
} from './resources.js';

export interface DemoAccount {
  readonly role: ServiceRole;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  /** Engineers are split into two groups (甲/乙); group membership is only for assignment and workload. */
  readonly group?: '甲组' | '乙组';
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: SERVICE_ROLE.supervisor,
    username: 'supervisor',
    email: 'supervisor@service.local',
    name: '服务主管',
    password: 'Service@1234',
  },
  {
    role: SERVICE_ROLE.engineer,
    username: 'engineer',
    email: 'engineer@service.local',
    name: '服务工程师甲',
    password: 'Service@1234',
    group: '甲组',
  },
  {
    role: SERVICE_ROLE.engineer,
    username: 'engineer2',
    email: 'engineer2@service.local',
    name: '服务工程师乙',
    password: 'Service@1234',
    group: '乙组',
  },
  {
    role: SERVICE_ROLE.observer,
    username: 'observer',
    email: 'observer@service.local',
    name: '服务观察员',
    password: 'Service@1234',
  },
  {
    role: SERVICE_ROLE.integrator,
    username: 'integration',
    email: 'integration@service.local',
    name: '外部集成账号',
    password: 'Service@1234',
  },
];

export interface ProvisionDependencies {
  readonly database: DatabaseManager;
  readonly authz: AppAuthorization;
  readonly users: UserAdministrationService;
}

export interface ProvisionResult {
  readonly permissionSetsCreated: readonly string[];
  readonly accountsCreated: readonly string[];
  readonly assignmentsCreated: number;
  readonly demoDataCreated: boolean;
}

interface SeedActors {
  readonly byRole: ReadonlyMap<ServiceRole, string>;
  readonly engineers: readonly string[];
}

function isoDaysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function dateOnly(days: number): string {
  return isoDaysFromNow(days).toISOString().slice(0, 10);
}

/**
 * Idempotently prepares a fresh installation: the four job permission sets, one
 * account per job (two engineers, one per group), the assignments joining them,
 * and demonstration business records. Existing accounts are never overwritten
 * and existing permission sets are never re-granted, so an administrator's edits
 * survive a restart.
 */
export async function provisionServiceDesk(
  dependencies: ProvisionDependencies,
): Promise<ProvisionResult> {
  const { database, authz, users } = dependencies;
  const permissionSetsCreated: string[] = [];
  const accountsCreated: string[] = [];

  // 1. Permission sets.
  for (const definition of SERVICE_ROLE_DEFINITIONS) {
    const existing = await authz.permissionSets.get(definition.key);
    if (existing) continue;
    await authz.permissionSets.create(buildPermissionSet(definition));
    permissionSetsCreated.push(definition.key);
  }

  // 2. Accounts, matched by username. The user-administration service owns
  //    password hashing, so accounts are created through it rather than by
  //    writing the user table.
  const existingUsers = await users.list({ page: 1, pageSize: 100 });
  const byUsername = new Map(
    existingUsers.items
      .filter((user) => user.username)
      .map((user) => [user.username!.toLowerCase(), user]),
  );
  const accountRoles: { role: ServiceRole; userId: string }[] = [];
  const byRole = new Map<ServiceRole, string>();
  const engineers: string[] = [];
  for (const account of DEMO_ACCOUNTS) {
    let userId: string;
    const found = byUsername.get(account.username.toLowerCase());
    if (found) {
      userId = found.id;
    } else {
      const created = await users.create({
        name: account.name,
        username: account.username,
        email: account.email,
        password: account.password,
      });
      userId = created.id;
      accountsCreated.push(account.username);
    }
    accountRoles.push({ role: account.role, userId });
    if (!byRole.has(account.role)) byRole.set(account.role, userId);
    if (account.role === SERVICE_ROLE.engineer) engineers.push(userId);
  }

  // 3. Assignments. An assignment the administrator removed is left removed:
  //    only a missing one for a role this module owns is added, and only when
  //    the account exists.
  let assignmentsCreated = 0;
  const assignments = await authz.permissionSets.listAssignments();
  const assigned = new Set(
    assignments
      .filter((assignment) => assignment.subject.type === 'user')
      .map(
        (assignment) => `${assignment.permissionSet}:${assignment.subject.id}`,
      ),
  );
  for (const account of accountRoles) {
    const key = `${account.role}:${account.userId}`;
    if (assigned.has(key)) continue;
    await authz.permissionSets.assign({
      subject: { type: 'user', id: account.userId },
      permissionSet: account.role,
    });
    assignmentsCreated += 1;
  }

  // 4. Demonstration records, only when the business tables are still empty.
  const customerCount = await database
    .repository<CustomerRow>('customers')
    .count();
  let demoDataCreated = false;
  if (customerCount === 0) {
    demoDataCreated = await seedDemoData(database, { byRole, engineers });
  }

  return {
    permissionSetsCreated,
    accountsCreated,
    assignmentsCreated,
    demoDataCreated,
  };
}

async function seedDemoData(
  database: DatabaseManager,
  actors: SeedActors,
): Promise<boolean> {
  const supervisorId = actors.byRole.get(SERVICE_ROLE.supervisor) ?? null;
  const engineerA = actors.engineers[0] ?? null;
  const engineerB = actors.engineers[1] ?? engineerA;
  const now = new Date();
  const uuid = () => crypto.randomUUID();

  const customerRepo = database.repository<CustomerRow>('customers');
  const deviceRepo = database.repository<DeviceRow>('devices');
  const orderRepo = database.repository<WorkOrderRow>('workOrders');
  const inspectionRepo = database.repository<InspectionRow>('inspections');
  const knowledgeRepo =
    database.repository<KnowledgeArticleRow>('knowledgeArticles');
  const manualRepo = database.repository<DeviceManualRow>('deviceManuals');

  // -- Three customers ---------------------------------------------------
  const customerA = uuid();
  const customerB = uuid();
  const customerC = uuid();
  await customerRepo.createMany({
    values: [
      {
        id: customerA,
        name: '华远智能制造有限公司',
        contactName: '李工',
        contactPhone: '13800000001',
        notes: '重点客户，设备停机影响产线。',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: customerB,
        name: '鼎新医疗科技',
        contactName: '王医生',
        contactPhone: '13800000002',
        notes: '医疗器械，需优先响应。',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: customerC,
        name: '远洋物流装备',
        contactName: '赵经理',
        contactPhone: '13800000003',
        notes: '仓储与物流设备，按季度巡检。',
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // -- Six devices, split across the two engineer groups -----------------
  const device1 = uuid();
  const device2 = uuid();
  const device3 = uuid();
  const device4 = uuid();
  const device5 = uuid();
  const device6 = uuid();
  await deviceRepo.createMany({
    values: [
      {
        id: device1,
        code: 'DEV-1001',
        name: '数控加工中心 XK-200',
        customerId: customerA,
        serviceEngineerId: engineerA,
        enabled: true,
        nextInspectionAt: isoDaysFromNow(5),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: device2,
        code: 'DEV-1002',
        name: 'CT 扫描仪 CT-64',
        customerId: customerB,
        serviceEngineerId: engineerA,
        enabled: true,
        nextInspectionAt: isoDaysFromNow(-2),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: device3,
        code: 'DEV-1003',
        name: '自动化立体仓库 AS/RS-8',
        customerId: customerC,
        serviceEngineerId: engineerB,
        enabled: true,
        nextInspectionAt: isoDaysFromNow(10),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: device4,
        code: 'DEV-1004',
        name: '光纤激光切割机 LC-3015',
        customerId: customerA,
        serviceEngineerId: engineerB,
        enabled: true,
        nextInspectionAt: isoDaysFromNow(1),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: device5,
        code: 'DEV-1005',
        name: '六轴工业机器人 IRB-6700',
        customerId: customerC,
        serviceEngineerId: engineerA,
        enabled: true,
        nextInspectionAt: isoDaysFromNow(20),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: device6,
        code: 'DEV-1006',
        name: '旧型号注塑机（已停用）',
        customerId: customerB,
        serviceEngineerId: null,
        enabled: false,
        nextInspectionAt: null,
        notes: '已停用，仅保留历史记录，不再生成巡检。',
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // -- Six work orders covering every status, priority, confidentiality and
  //    an overdue order ------------------------------------------------
  await orderRepo.createMany({
    values: [
      {
        id: uuid(),
        code: 'WO-DEMO-0001',
        title: '数控机床主轴异响',
        customerId: customerA,
        deviceId: device1,
        problem: '客户反馈主轴在高速运转时出现明显异响，需现场排查。',
        priority: 'urgent',
        status: WORK_ORDER_STATUS.pendingAccept,
        dueAt: isoDaysFromNow(-1),
        assigneeId: engineerA,
        confidential: false,
        acceptanceNote: null,
        resolution: null,
        rejectionReason: null,
        acceptedAt: null,
        startedAt: null,
        submittedAt: null,
        closedAt: null,
        submitCount: 0,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        code: 'WO-DEMO-0002',
        title: 'CT 扫描仪报错 E-204',
        customerId: customerB,
        deviceId: device2,
        problem: '设备开机自检报错 E-204，无法进入扫描流程。',
        priority: 'urgent',
        status: WORK_ORDER_STATUS.processing,
        dueAt: isoDaysFromNow(1),
        assigneeId: engineerA,
        confidential: false,
        acceptanceNote: '已受理，正在联系客户远程排查。',
        resolution: null,
        rejectionReason: null,
        acceptedAt: isoDaysFromNow(-1),
        startedAt: isoDaysFromNow(-1),
        submittedAt: null,
        closedAt: null,
        submitCount: 0,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        code: 'WO-DEMO-0003',
        title: '设备定期保养（内部机密）',
        customerId: customerA,
        deviceId: device1,
        problem: '按季度计划执行内部保养，涉及合同条款。',
        priority: 'normal',
        status: WORK_ORDER_STATUS.pendingConfirm,
        dueAt: isoDaysFromNow(2),
        assigneeId: engineerA,
        confidential: true,
        acceptanceNote: null,
        resolution: '已更换润滑脂并校准导轨。',
        rejectionReason: null,
        acceptedAt: isoDaysFromNow(-3),
        startedAt: isoDaysFromNow(-2),
        submittedAt: isoDaysFromNow(-1),
        closedAt: null,
        submitCount: 1,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        code: 'WO-DEMO-0004',
        title: '刀具库卡刀故障',
        customerId: customerA,
        deviceId: device1,
        problem: '换刀过程中刀库卡滞，已现场复位。',
        priority: 'normal',
        status: WORK_ORDER_STATUS.closed,
        dueAt: isoDaysFromNow(-5),
        assigneeId: engineerA,
        confidential: false,
        acceptanceNote: null,
        resolution: '清洁刀库并调整感应开关位置。',
        rejectionReason: null,
        acceptedAt: isoDaysFromNow(-6),
        startedAt: isoDaysFromNow(-6),
        submittedAt: isoDaysFromNow(-5),
        closedAt: isoDaysFromNow(-4),
        submitCount: 1,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        code: 'WO-DEMO-0005',
        title: '立体仓库提升机定位偏移',
        customerId: customerC,
        deviceId: device3,
        problem: '提升机取货时定位偏移约 5mm，偶发取货失败。',
        priority: 'normal',
        status: WORK_ORDER_STATUS.pendingHandle,
        dueAt: isoDaysFromNow(3),
        assigneeId: engineerB,
        confidential: false,
        acceptanceNote: '已受理，安排现场校准。',
        resolution: null,
        rejectionReason: null,
        acceptedAt: isoDaysFromNow(-1),
        startedAt: null,
        submittedAt: null,
        closedAt: null,
        submitCount: 0,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        code: 'WO-DEMO-0006',
        title: '激光切割机冷却水报警',
        customerId: customerA,
        deviceId: device4,
        problem: '冷却水流量报警频繁触发，已停机等待处理。',
        priority: 'urgent',
        status: WORK_ORDER_STATUS.pendingAccept,
        dueAt: isoDaysFromNow(-2),
        assigneeId: engineerB,
        confidential: false,
        acceptanceNote: null,
        resolution: null,
        rejectionReason: null,
        acceptedAt: null,
        startedAt: null,
        submittedAt: null,
        closedAt: null,
        submitCount: 0,
        createdById: supervisorId,
        source: 'internal',
        externalEventNo: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // -- Inspections -------------------------------------------------------
  await inspectionRepo.createMany({
    values: [
      {
        id: uuid(),
        deviceId: device1,
        plannedDate: dateOnly(5),
        assigneeId: engineerA,
        status: 'pending',
        result: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        deviceId: device2,
        plannedDate: dateOnly(-2),
        assigneeId: engineerA,
        status: 'pending',
        result: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // -- Knowledge base ----------------------------------------------------
  await knowledgeRepo.createMany({
    values: [
      {
        id: uuid(),
        title: '主轴异响排查指引',
        body: '1. 检查主轴轴承润滑；2. 检查皮带张紧度；3. 必要时停机拆检。',
        published: true,
        createdById: supervisorId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        title: 'CT 扫描仪常见报错对照表',
        body: 'E-204：球管温度异常；E-310：探测器通信失败。',
        published: true,
        createdById: supervisorId,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // -- Two device manuals ------------------------------------------------
  await manualRepo.createMany({
    values: [
      {
        id: uuid(),
        title: 'XK-200 数控加工中心操作与维护手册',
        filename: 'xk-200-manual.md',
        content:
          '# XK-200 操作与维护\n\n## 日常检查\n- 检查主轴润滑\n- 检查导轨清洁\n\n## 主轴异响\n更换润滑脂并校准主轴。',
        status: 'available',
        failureReason: null,
        knowledgeBaseKey: null,
        documentId: null,
        uploadedById: supervisorId,
        processedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuid(),
        title: 'CT-64 扫描仪排障手册',
        filename: 'ct-64-manual.md',
        content:
          '# CT-64 排障\n\n## E-204\n球管温度异常，检查冷却与散热。\n\n## E-310\n探测器通信失败，检查连接。',
        status: 'available',
        failureReason: null,
        knowledgeBaseKey: null,
        documentId: null,
        uploadedById: supervisorId,
        processedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  return true;
}
