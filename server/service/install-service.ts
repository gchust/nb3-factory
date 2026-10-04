import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { DatabaseManager, Repository } from '@nocobase/db';

import type { ServiceConfig } from '../config/service.js';
import { ROLE_PERMISSION_SETS } from './access.js';
import { buildPermissionSetSpecs } from './authorization.js';
import type {
  Customer,
  Device,
  Inspection,
  KnowledgeArticle,
  Ticket,
  TicketEvent,
  TicketShare,
} from './domain.js';

export interface ServiceInstallResult {
  readonly accounts: number;
  readonly permissionSets: number;
  readonly customers: number;
  readonly devices: number;
  readonly tickets: number;
  readonly inspections: number;
  readonly articles: number;
}

export interface ServiceInstall {
  install(): Promise<ServiceInstallResult>;
}

export interface ServiceInstallOptions {
  readonly database: DatabaseManager;
  readonly authz: AppAuthorization;
  readonly users: UserAdministrationService;
  readonly config: ServiceConfig;
}

interface DemoAccount {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly permissionSet: string;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: '王主管',
    username: 'supervisor',
    email: 'supervisor@service.local',
    permissionSet: ROLE_PERMISSION_SETS.supervisor,
  },
  {
    name: '李工',
    username: 'engineer1',
    email: 'engineer1@service.local',
    permissionSet: ROLE_PERMISSION_SETS.engineer,
  },
  {
    name: '陈工',
    username: 'engineer2',
    email: 'engineer2@service.local',
    permissionSet: ROLE_PERMISSION_SETS.engineer,
  },
  {
    name: '赵观察',
    username: 'observer',
    email: 'observer@service.local',
    permissionSet: ROLE_PERMISSION_SETS.observer,
  },
  {
    name: '外部平台',
    username: 'integration',
    email: 'integration@service.local',
    permissionSet: ROLE_PERMISSION_SETS.integration,
  },
];

/**
 * Idempotent provisioning of the demonstration installation: the four business
 * Permission Sets, the accounts that hold them, and a small but complete
 * business dataset. Running it twice changes nothing: every record is looked
 * up by its business key before it is created, and the Permission Sets are
 * written with `update` rather than re-created, so an installation that
 * adjusted them by hand keeps its adjustments only where the spec agrees.
 */
export function createServiceInstall(
  options: ServiceInstallOptions,
): ServiceInstall {
  const { database, authz, users, config } = options;

  const customers = (): Repository<Customer> =>
    database.repository<Customer>('customers');
  const devices = (): Repository<Device> =>
    database.repository<Device>('devices');
  const tickets = (): Repository<Ticket> =>
    database.repository<Ticket>('tickets');
  const events = (): Repository<TicketEvent> =>
    database.repository<TicketEvent>('ticket_events');
  const shares = (): Repository<TicketShare> =>
    database.repository<TicketShare>('ticket_shares');
  const inspections = (): Repository<Inspection> =>
    database.repository<Inspection>('inspections');
  const articles = (): Repository<KnowledgeArticle> =>
    database.repository<KnowledgeArticle>('knowledge_articles');

  async function ensurePermissionSets(): Promise<number> {
    const specs = buildPermissionSetSpecs(authz);
    let count = 0;
    for (const spec of specs) {
      const existing = await authz.permissionSets.get(spec.key);
      if (existing) {
        await authz.permissionSets.update(spec.key, {
          key: spec.key,
          title: spec.title,
          grants: spec.grants,
        });
      } else {
        await authz.permissionSets.create({
          key: spec.key,
          title: spec.title,
          grants: spec.grants,
        });
      }
      count += 1;
    }
    return count;
  }

  async function ensureAccounts(): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    if (!config.demoAccounts.enabled) return ids;
    const existing = await users.list({ pageSize: 200 });
    const byUsername = new Map(
      existing.items.map((user) => [user.username, user]),
    );
    for (const account of DEMO_ACCOUNTS) {
      let user = byUsername.get(account.username);
      if (!user) {
        user = await users.create({
          name: account.name,
          username: account.username,
          email: account.email,
          password: config.demoAccounts.password,
        });
      }
      ids.set(account.username, user.id);
      await authz.permissionSets.replaceSubjectAssignments({
        subject: { type: 'user', id: user.id },
        managedPermissionSets: Object.values(ROLE_PERMISSION_SETS),
        permissionSets: [account.permissionSet],
      });
    }
    return ids;
  }

  async function ensureCustomer(
    input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Customer> {
    const existing = await customers().findOne({
      filter: { code: input.code },
    });
    if (existing) return existing;
    const now = new Date().toISOString();
    const created = await customers().createOne({
      values: { ...input, createdAt: now, updatedAt: now },
    });
    return created.record;
  }

  async function ensureDevice(
    input: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Device> {
    const existing = await devices().findOne({
      filter: { deviceNo: input.deviceNo },
    });
    if (existing) return existing;
    const now = new Date().toISOString();
    const created = await devices().createOne({
      values: { ...input, createdAt: now, updatedAt: now },
    });
    return created.record;
  }

  async function ensureTicket(input: {
    ticketNo: string;
    values: Partial<Ticket>;
  }): Promise<Ticket> {
    const existing = await tickets().findOne({
      filter: { ticketNo: input.ticketNo },
    });
    if (existing) return existing;
    const now = new Date().toISOString();
    const created = await tickets().createOne({
      values: {
        ticketNo: input.ticketNo,
        title: input.values.title ?? input.ticketNo,
        description: input.values.description ?? null,
        status: input.values.status ?? 'pending',
        priority: input.values.priority ?? 'normal',
        confidential: input.values.confidential ?? false,
        customerId: input.values.customerId ?? null,
        deviceId: input.values.deviceId ?? null,
        assigneeId: input.values.assigneeId ?? null,
        reporterId: input.values.reporterId ?? null,
        source: input.values.source ?? 'internal',
        externalEventNo: input.values.externalEventNo ?? null,
        acceptedAt: input.values.acceptedAt ?? null,
        startedAt: input.values.startedAt ?? null,
        submittedAt: input.values.submittedAt ?? null,
        closedAt: input.values.closedAt ?? null,
        slaDueAt: input.values.slaDueAt ?? null,
        handling: input.values.handling ?? null,
        resolution: input.values.resolution ?? null,
        acceptanceNote: input.values.acceptanceNote ?? null,
        createdAt: input.values.createdAt ?? now,
        updatedAt: input.values.updatedAt ?? now,
      },
    });
    return created.record;
  }

  async function ensureEvent(values: {
    ticketId: number;
    type: TicketEvent['type'];
    status?: TicketEvent['status'];
    operatorId?: number | null;
    operatorName?: string | null;
    comment?: string | null;
    createdAt?: string;
  }): Promise<void> {
    const existing = await events().findOne({
      filter: { ticketId: values.ticketId, type: values.type },
    });
    if (existing) return;
    await events().createOne({
      values: {
        ticketId: values.ticketId,
        type: values.type,
        status: values.status ?? null,
        operatorId: values.operatorId ?? null,
        operatorName: values.operatorName ?? null,
        comment: values.comment ?? null,
        payload: null,
        createdAt: values.createdAt ?? new Date().toISOString(),
      },
    });
  }

  function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString();
  }

  function dateOnly(days: number): string {
    return daysFromNow(days).slice(0, 10);
  }

  async function ensureShare(values: {
    ticketId: number;
    granteeId: number;
    granteeName: string;
    grantedById: number | null;
    reason: string;
    expiresAt: string | null;
    revoked?: boolean;
  }): Promise<void> {
    const existing = await shares().findOne({
      filter: { ticketId: values.ticketId, granteeId: values.granteeId },
    });
    if (existing) return;
    const now = new Date().toISOString();
    await shares().createOne({
      values: {
        ticketId: values.ticketId,
        granteeId: values.granteeId,
        granteeName: values.granteeName,
        grantedById: values.grantedById,
        reason: values.reason,
        sharingRuleKey: 'service.tickets.temporary',
        expiresAt: values.expiresAt,
        revoked: values.revoked ?? false,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async function ensureArticle(
    input: Omit<
      KnowledgeArticle,
      'id' | 'createdAt' | 'updatedAt' | 'createdById'
    > & {
      createdById?: number | null;
    },
  ): Promise<void> {
    const existing = await articles().findOne({
      filter: { title: input.title },
    });
    if (existing) return;
    const now = new Date().toISOString();
    await articles().createOne({
      values: {
        ...input,
        createdById: input.createdById ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async function ensureInspection(values: {
    deviceId: number;
    plannedDate: string;
    status: Inspection['status'];
    assigneeId: number | null;
    result?: string | null;
    notes?: string | null;
    completedAt?: string | null;
  }): Promise<void> {
    const existing = await inspections().findOne({
      filter: { deviceId: values.deviceId, plannedDate: values.plannedDate },
    });
    if (existing) return;
    const now = new Date().toISOString();
    await inspections().createOne({
      values: {
        deviceId: values.deviceId,
        plannedDate: values.plannedDate,
        status: values.status,
        assigneeId: values.assigneeId,
        result: values.result ?? null,
        notes: values.notes ?? null,
        ticketId: null,
        completedAt: values.completedAt ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async function ensureDemoData(accountIds: Map<string, string>): Promise<{
    customers: number;
    devices: number;
    tickets: number;
    inspections: number;
    articles: number;
  }> {
    const supervisorId = numberOrNull(accountIds.get('supervisor'));
    const engineer1Id = numberOrNull(accountIds.get('engineer1'));
    const engineer2Id = numberOrNull(accountIds.get('engineer2'));
    const observerId = numberOrNull(accountIds.get('observer'));

    const hd = await ensureCustomer({
      code: 'CUST-0001',
      name: '华东电子集团',
      contact: '张涛',
      phone: '021-5566-1000',
      level: 'vip',
      region: '华东',
    });
    const hx = await ensureCustomer({
      code: 'CUST-0002',
      name: '恒信制造有限公司',
      contact: '刘敏',
      phone: '010-8899-2200',
      level: 'vip',
      region: '华北',
    });
    const lt = await ensureCustomer({
      code: 'CUST-0003',
      name: '蓝天医院',
      contact: '孙倩',
      phone: '020-3344-8800',
      level: 'standard',
      region: '华南',
    });
    const xh = await ensureCustomer({
      code: 'CUST-0004',
      name: '星海数据中心',
      contact: '周航',
      phone: '0571-2233-9900',
      level: 'standard',
      region: '华东',
    });

    const machine = await ensureDevice({
      deviceNo: 'DEV-1001',
      model: 'CK6140 数控机床',
      serialNo: 'SN-CK6140-0001',
      customerId: hd.id,
      status: 'active',
      installedAt: daysFromNow(-420),
      warrantyUntil: daysFromNow(310),
      nextInspectionAt: daysFromNow(-3),
      location: '一号车间',
      notes: '每天两次巡检主轴温度',
    });
    const compressor = await ensureDevice({
      deviceNo: 'DEV-1002',
      model: 'AC-75 空气压缩机',
      serialNo: 'SN-AC75-0042',
      customerId: hx.id,
      status: 'active',
      installedAt: daysFromNow(-260),
      warrantyUntil: daysFromNow(100),
      nextInspectionAt: daysFromNow(-10),
      location: '动力站',
      notes: null,
    });
    const inverter = await ensureDevice({
      deviceNo: 'DEV-1003',
      model: 'VFD-220 变频器',
      serialNo: 'SN-VFD220-7788',
      customerId: hx.id,
      status: 'maintenance',
      installedAt: daysFromNow(-180),
      warrantyUntil: daysFromNow(20),
      nextInspectionAt: daysFromNow(12),
      location: '配电间',
      notes: '待更换散热风扇',
    });
    const xray = await ensureDevice({
      deviceNo: 'DEV-1004',
      model: 'XR-500 X射线机',
      serialNo: 'SN-XR500-3301',
      customerId: lt.id,
      status: 'active',
      installedAt: daysFromNow(-90),
      warrantyUntil: daysFromNow(640),
      nextInspectionAt: daysFromNow(2),
      location: '影像科',
      notes: null,
    });
    const cooler = await ensureDevice({
      deviceNo: 'DEV-1005',
      model: 'CT-200 冷却塔',
      serialNo: 'SN-CT200-5566',
      customerId: xh.id,
      status: 'active',
      installedAt: daysFromNow(-540),
      warrantyUntil: daysFromNow(-40),
      nextInspectionAt: daysFromNow(25),
      location: '屋顶机房',
      notes: null,
    });
    await ensureDevice({
      deviceNo: 'DEV-1006',
      model: 'GEN-300 备用发电机',
      serialNo: 'SN-GEN300-9911',
      customerId: hd.id,
      status: 'disabled',
      installedAt: daysFromNow(-900),
      warrantyUntil: daysFromNow(-300),
      nextInspectionAt: null,
      location: '地下机房',
      notes: '已停用，等待报废',
    });

    const now = Date.now();
    const ticket1 = await ensureTicket({
      ticketNo: 'T-20260110-0001',
      values: {
        title: 'X射线机无法开机',
        description: '客户反映设备按下电源后无任何反应，疑似主电源模块故障。',
        status: 'pending',
        priority: 'urgent',
        customerId: lt.id,
        deviceId: xray.id,
        reporterId: supervisorId,
        slaDueAt: new Date(now + 4 * 3600_000).toISOString(),
        createdAt: new Date(now - 2 * 3600_000).toISOString(),
      },
    });
    const ticket2 = await ensureTicket({
      ticketNo: 'T-20260109-0002',
      values: {
        title: '数控机床主轴异响',
        description: '运行到 3000 转时主轴出现周期性异响。',
        status: 'accepted',
        priority: 'high',
        customerId: hd.id,
        deviceId: machine.id,
        assigneeId: engineer1Id,
        reporterId: supervisorId,
        acceptedAt: new Date(now - 30 * 3600_000).toISOString(),
        slaDueAt: new Date(now + 24 * 3600_000).toISOString(),
        createdAt: new Date(now - 32 * 3600_000).toISOString(),
      },
    });
    const ticket3 = await ensureTicket({
      ticketNo: 'T-20260108-0003',
      values: {
        title: '空压机压力不足',
        description: '储气罐压力长期低于 0.6MPa，影响生产线。',
        status: 'processing',
        priority: 'high',
        customerId: hx.id,
        deviceId: compressor.id,
        assigneeId: engineer2Id,
        reporterId: supervisorId,
        acceptedAt: new Date(now - 50 * 3600_000).toISOString(),
        startedAt: new Date(now - 44 * 3600_000).toISOString(),
        handling: '已更换进气滤芯，正在观察压力恢复情况。',
        slaDueAt: new Date(now + 6 * 3600_000).toISOString(),
        createdAt: new Date(now - 52 * 3600_000).toISOString(),
      },
    });
    const ticket4 = await ensureTicket({
      ticketNo: 'T-20260107-0004',
      values: {
        title: '变频器报过流故障',
        description: 'VFD-220 报 OC 过流，复位后短时再次报警。',
        status: 'pending_confirm',
        priority: 'normal',
        customerId: hx.id,
        deviceId: inverter.id,
        assigneeId: engineer1Id,
        reporterId: supervisorId,
        acceptedAt: new Date(now - 80 * 3600_000).toISOString(),
        startedAt: new Date(now - 76 * 3600_000).toISOString(),
        submittedAt: new Date(now - 20 * 3600_000).toISOString(),
        resolution: '更换电机侧接线端子并紧固，连续运行 4 小时未再报警。',
        createdAt: new Date(now - 82 * 3600_000).toISOString(),
      },
    });
    const ticket5 = await ensureTicket({
      ticketNo: 'T-20260105-0005',
      values: {
        title: '冷却塔水温偏高',
        description: '回水温度达到 38℃，超过设定值。',
        status: 'closed',
        priority: 'low',
        customerId: xh.id,
        deviceId: cooler.id,
        assigneeId: engineer2Id,
        reporterId: supervisorId,
        acceptedAt: new Date(now - 200 * 3600_000).toISOString(),
        startedAt: new Date(now - 196 * 3600_000).toISOString(),
        submittedAt: new Date(now - 180 * 3600_000).toISOString(),
        closedAt: new Date(now - 176 * 3600_000).toISOString(),
        resolution: '清洗填料并调整风机变频参数，水温恢复至 32℃。',
        acceptanceNote: '客户确认水温恢复正常。',
        createdAt: new Date(now - 204 * 3600_000).toISOString(),
      },
    });
    const ticket6 = await ensureTicket({
      ticketNo: 'T-20260104-0006',
      values: {
        title: '主轴精度投诉（保密）',
        description: '客户投诉加工件尺寸偏差，涉及商务赔偿，需要保密处理。',
        status: 'accepted',
        priority: 'urgent',
        confidential: true,
        customerId: hd.id,
        deviceId: machine.id,
        assigneeId: engineer1Id,
        reporterId: supervisorId,
        acceptedAt: new Date(now - 10 * 3600_000).toISOString(),
        slaDueAt: new Date(now + 2 * 3600_000).toISOString(),
        createdAt: new Date(now - 12 * 3600_000).toISOString(),
      },
    });

    const createdEvents: { ticket: Ticket; status: TicketEvent['status'] }[] = [
      { ticket: ticket1, status: 'pending' },
      { ticket: ticket2, status: 'pending' },
      { ticket: ticket2, status: 'accepted' },
      { ticket: ticket3, status: 'pending' },
      { ticket: ticket3, status: 'accepted' },
      { ticket: ticket3, status: 'processing' },
      { ticket: ticket4, status: 'pending' },
      { ticket: ticket4, status: 'accepted' },
      { ticket: ticket4, status: 'processing' },
      { ticket: ticket4, status: 'pending_confirm' },
      { ticket: ticket5, status: 'pending' },
      { ticket: ticket5, status: 'accepted' },
      { ticket: ticket5, status: 'processing' },
      { ticket: ticket5, status: 'pending_confirm' },
      { ticket: ticket5, status: 'closed' },
      { ticket: ticket6, status: 'pending' },
      { ticket: ticket6, status: 'accepted' },
    ];
    let previousTicket: Ticket | undefined;
    for (const entry of createdEvents) {
      const isFirst = previousTicket?.id !== entry.ticket.id;
      previousTicket = entry.ticket;
      await ensureEvent({
        ticketId: entry.ticket.id,
        type: isFirst ? 'created' : eventTypeFor(entry.status),
        status: entry.status,
        operatorId: supervisorId,
        operatorName: '王主管',
      });
    }

    if (observerId != null && supervisorId != null) {
      await ensureShare({
        ticketId: ticket2.id,
        granteeId: observerId,
        granteeName: '赵观察',
        grantedById: supervisorId,
        reason: '客户回访需要查看处理记录',
        expiresAt: daysFromNow(48),
      });
      await ensureShare({
        ticketId: ticket4.id,
        granteeId: observerId,
        granteeName: '赵观察',
        grantedById: supervisorId,
        reason: '观察处理进度',
        expiresAt: daysFromNow(24),
      });
      await ensureShare({
        ticketId: ticket5.id,
        granteeId: observerId,
        granteeName: '赵观察',
        grantedById: supervisorId,
        reason: '历史案例复盘',
        expiresAt: daysFromNow(-1),
        revoked: true,
      });
    }

    await ensureInspection({
      deviceId: machine.id,
      plannedDate: dateOnly(-7),
      status: 'overdue',
      assigneeId: engineer1Id,
      notes: '超过计划日期未完成，请尽快处理。',
    });
    await ensureInspection({
      deviceId: compressor.id,
      plannedDate: dateOnly(-4),
      status: 'in_progress',
      assigneeId: engineer2Id,
      notes: '现场已到位，正在检测压力开关。',
    });
    await ensureInspection({
      deviceId: xray.id,
      plannedDate: dateOnly(2),
      status: 'planned',
      assigneeId: engineer2Id,
      notes: '季度巡检',
    });
    await ensureInspection({
      deviceId: cooler.id,
      plannedDate: dateOnly(-30),
      status: 'completed',
      assigneeId: engineer1Id,
      result: 'normal',
      notes: '换热效率正常，已清理杂物。',
      completedAt: daysFromNow(-30),
    });

    await ensureArticle({
      title: 'CK6140 数控机床主轴异响排查手册',
      category: 'troubleshooting',
      deviceModel: 'CK6140',
      tags: '主轴,异响,数控机床',
      status: 'published',
      summary: '从轴承预紧、皮带张力与冷却液三个方面定位主轴异响。',
      content:
        '第一步：停机并切断电源，用手转动主轴确认是否存在卡滞。\n第二步：检查主轴轴承预紧量，标准值为 0.02~0.04mm。\n第三步：检查传动皮带张力，按压下沉量应为 8~12mm。\n第四步：确认冷却液清洁度，必要时更换滤芯。\n若以上均正常仍存在异响，请联系厂家更换主轴轴承组。',
      createdById: supervisorId,
    });
    await ensureArticle({
      title: 'AC-75 空压机压力不足处理指引',
      category: 'troubleshooting',
      deviceModel: 'AC-75',
      tags: '空压机,压力,滤芯',
      status: 'published',
      summary: '按进气、阀门、泄漏的顺序排查压力不足。',
      content:
        '第一步：检查进气滤芯是否堵塞，压差超过 0.5bar 时更换。\n第二步：确认最小压力阀与卸荷阀动作正常。\n第三步：用肥皂水检查管路接头是否存在泄漏。\n第四步：检查压力传感器读数是否与实际一致。',
      createdById: supervisorId,
    });
    await ensureArticle({
      title: 'VFD-220 变频器过流故障代码说明',
      category: 'troubleshooting',
      deviceModel: 'VFD-220',
      tags: '变频器,过流,OC',
      status: 'published',
      summary: 'OC 报警的常见原因与现场处置步骤。',
      content:
        'OC1：加速中过流，检查加速时间与负载惯量。\nOC2：减速中过流，延长减速时间或加装制动单元。\nOC3：恒速中过流，检查电机绝缘与接线端子。\n处置后必须复位并空载试运行 10 分钟。',
      createdById: supervisorId,
    });
    await ensureArticle({
      title: 'XR-500 X射线机开机自检流程',
      category: 'sop',
      deviceModel: 'XR-500',
      tags: 'X射线,开机,自检',
      status: 'published',
      summary: '开机自检失败时的标准排查顺序。',
      content:
        '第一步：确认主电源指示灯点亮，电压在 220V ± 10%。\n第二步：检查急停按钮是否复位。\n第三步：观察控制面板错误代码并记录。\n第四步：若显示 E01，检查高压发生器连接线缆。',
      createdById: supervisorId,
    });
    await ensureArticle({
      title: '设备保修与备件更换流程',
      category: 'sop',
      deviceModel: null,
      tags: '保修,备件,流程',
      status: 'published',
      summary: '判断设备是否在保，以及备件申请与更换的审批路径。',
      content:
        '在保判断：以设备 warrantyUntil 字段为准。\n备件申请：在工单中记录备件型号与数量，由主管审核。\n更换后：上传更换前后照片，并在工单中填写更换记录。',
      createdById: supervisorId,
    });
    await ensureArticle({
      title: 'GEN-300 发电机季节性保养（草稿）',
      category: 'manual',
      deviceModel: 'GEN-300',
      tags: '发电机,保养',
      status: 'draft',
      summary: '待补充不同季节的保养要点。',
      content: '草稿内容，尚未发布。',
      createdById: supervisorId,
    });

    return {
      customers: 4,
      devices: 6,
      tickets: 6,
      inspections: 4,
      articles: 6,
    };
  }

  return {
    async install() {
      // Permission Sets before accounts: the account pass assigns each demo user
      // its role, which requires the set to exist. The reverse order throws
      // PermissionSetNotFoundError on a fresh database.
      const permissionSets = await ensurePermissionSets();
      const accountIds = await ensureAccounts();
      const data = await ensureDemoData(accountIds);
      return {
        accounts: accountIds.size,
        permissionSets,
        ...data,
      };
    },
  };
}

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventTypeFor(status: TicketEvent['status']): TicketEvent['type'] {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'processing':
      return 'started';
    case 'pending_confirm':
      return 'submitted';
    case 'closed':
      return 'closed';
    case 'returned':
      return 'returned';
    default:
      return 'created';
  }
}
