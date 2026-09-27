import { defineSeed } from '@nocobase/db';

/**
 * Delivery fixtures for the equipment service system: six customers, twelve
 * devices, eighteen tickets across every state, six knowledge articles and one
 * inspection plan per enabled device.
 *
 * The seed is idempotent: it does nothing when customers already exist, and
 * every child row is written once with the parent id returned by the
 * Repository. Dates are relative to installation time so the overdue examples
 * stay overdue and the closed examples stay historical.
 */

function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

const EAST = 'east';
const SOUTH = 'south';
const DAY = 24 * 60 * 60 * 1000;

const CUSTOMERS = [
  {
    code: 'CUST-001',
    name: '苏州精密制造有限公司',
    contactName: '王建国',
    contactPhone: '13800000001',
    contactEmail: 'wangjg@szjm.example',
    region: EAST,
    level: 'vip',
    address: '江苏省苏州市工业园区星湖街 328 号',
  },
  {
    code: 'CUST-002',
    name: '杭州数字能源有限公司',
    contactName: '李婷',
    contactPhone: '13800000002',
    contactEmail: 'liting@hzdn.example',
    region: EAST,
    level: 'standard',
    address: '浙江省杭州市滨江区江南大道 588 号',
  },
  {
    code: 'CUST-003',
    name: '上海海联物流有限公司',
    contactName: '赵强',
    contactPhone: '13800000003',
    contactEmail: 'zhaoq@shhl.example',
    region: EAST,
    level: 'standard',
    address: '上海市浦东新区物流园区 12 号库',
  },
  {
    code: 'CUST-004',
    name: '广州南方医疗科技有限公司',
    contactName: '陈丽',
    contactPhone: '13800000004',
    contactEmail: 'chenli@gznf.example',
    region: SOUTH,
    level: 'vip',
    address: '广东省广州市黄埔区科学城 8 号',
  },
  {
    code: 'CUST-005',
    name: '深圳芯智电子有限公司',
    contactName: '刘鹏',
    contactPhone: '13800000005',
    contactEmail: 'liup@szxz.example',
    region: SOUTH,
    level: 'standard',
    address: '广东省深圳市南山区科技园北区 5 栋',
  },
  {
    code: 'CUST-006',
    name: '东莞恒达新材料有限公司',
    contactName: '周敏',
    contactPhone: '13800000006',
    contactEmail: 'zhoum@hdnh.example',
    region: SOUTH,
    level: 'standard',
    address: '广东省东莞市松山湖高新区 1 号',
  },
] as const;

const DEVICE_MODELS = ['ANL-500', 'ANL-700', 'ANL-900'] as const;

const ENGINEERS = {
  [EAST]: { id: 'svc-engineer-east-0001', name: '华东工程师 / East engineer' },
  [SOUTH]: {
    id: 'svc-engineer-south-0001',
    name: '华南工程师 / South engineer',
  },
} as const;

const SUPERVISOR = {
  id: 'svc-supervisor-0001',
  name: '服务主管 / Service supervisor',
};
const COLLABORATOR = {
  id: 'svc-collaborator-0001',
  name: '跨区域协作工程师 / Collaborating engineer',
};
const INTEGRATION = {
  id: 'svc-integration-0001',
  name: '外部集成账号 / Integration account',
};

interface TicketSpec {
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly region: 'east' | 'south';
  readonly customerIndex: number;
  readonly deviceIndex: number;
  readonly confidential?: boolean;
  readonly overdue?: boolean;
  readonly source?: string;
  readonly reporter?: 'supervisor' | 'integration';
  readonly resolution?: string;
  readonly laborCost?: number;
  readonly partsCost?: number;
  readonly internalNotes?: string;
  readonly shared?: boolean;
  readonly cancelled?: boolean;
}

const TICKETS: readonly TicketSpec[] = [
  {
    title: '数控冲床主控报警 E021',
    description: '开机后主控面板报警 E021，无法进入自动运行模式。',
    type: 'repair',
    priority: 'high',
    status: 'in_progress',
    region: EAST,
    customerIndex: 0,
    deviceIndex: 0,
    overdue: true,
    internalNotes: '初步判断为伺服驱动器编码器线束接触不良。',
  },
  {
    title: '年度精度校准服务',
    description: '客户申请年度精度校准并出具校准报告。',
    type: 'maintenance',
    priority: 'normal',
    status: 'pending_assignment',
    region: EAST,
    customerIndex: 0,
    deviceIndex: 1,
  },
  {
    title: '冷却系统异响',
    description: '设备运行 30 分钟后冷却泵出现周期性异响。',
    type: 'repair',
    priority: 'normal',
    status: 'pending_confirmation',
    region: EAST,
    customerIndex: 1,
    deviceIndex: 2,
    resolution: '更换冷却泵轴承并补充润滑脂，试运行 2 小时无异响。',
    laborCost: 480,
    partsCost: 260,
  },
  {
    title: '新增设备安装调试',
    description: '新到货 ANL-900 需要完成现场安装与联机调试。',
    type: 'installation',
    priority: 'normal',
    status: 'closed',
    region: EAST,
    customerIndex: 1,
    deviceIndex: 3,
    resolution: '完成安装、联机与操作培训，客户签字确认。',
    laborCost: 1200,
    partsCost: 0,
  },
  {
    title: '安全门联锁失效',
    description: '安全门打开时主轴未按预期停止，存在安全隐患。',
    type: 'repair',
    priority: 'urgent',
    status: 'in_progress',
    region: EAST,
    customerIndex: 2,
    deviceIndex: 4,
    overdue: true,
    confidential: true,
    internalNotes: '涉及安全合规，需主管复核后关闭。',
  },
  {
    title: '设备清洁与耗材更换',
    description: '按巡检计划进行清洁并更换过滤耗材。',
    type: 'inspection',
    priority: 'low',
    status: 'closed',
    region: EAST,
    customerIndex: 2,
    deviceIndex: 5,
    source: 'inspection',
    resolution: '已完成清洁与滤芯更换，运行参数正常。',
    laborCost: 200,
    partsCost: 90,
  },
  {
    title: '触摸屏无响应',
    description: '操作面板触摸屏间歇性无响应。',
    type: 'repair',
    priority: 'high',
    status: 'pending_assignment',
    region: SOUTH,
    customerIndex: 3,
    deviceIndex: 6,
    overdue: true,
  },
  {
    title: '医疗设备年度保养',
    description: '按合同约定完成年度保养并更新保养记录。',
    type: 'maintenance',
    priority: 'normal',
    status: 'pending_confirmation',
    region: SOUTH,
    customerIndex: 3,
    deviceIndex: 7,
    resolution: '完成保养项目 18 项，更换密封件一套。',
    laborCost: 760,
    partsCost: 320,
    shared: true,
  },
  {
    title: '伺服电机过热',
    description: '连续加工 1 小时后伺服电机温度报警。',
    type: 'repair',
    priority: 'high',
    status: 'in_progress',
    region: SOUTH,
    customerIndex: 4,
    deviceIndex: 8,
    shared: true,
    internalNotes: '已联系电机供应商确认散热方案。',
  },
  {
    title: '远程数据采集网关离线',
    description: '设备网关持续离线，无法上传运行数据。',
    type: 'repair',
    priority: 'normal',
    status: 'pending_assignment',
    region: SOUTH,
    customerIndex: 4,
    deviceIndex: 9,
    source: 'integration',
    reporter: 'integration',
  },
  {
    title: '客户投诉：响应超时',
    description: '客户反馈上次报修响应超过约定时限。',
    type: 'complaint',
    priority: 'high',
    status: 'draft',
    region: SOUTH,
    customerIndex: 5,
    deviceIndex: 10,
    reporter: 'supervisor',
  },
  {
    title: '刀具库换刀异常',
    description: '自动换刀过程中偶发刀具识别失败。',
    type: 'repair',
    priority: 'normal',
    status: 'pending_confirmation',
    region: SOUTH,
    customerIndex: 5,
    deviceIndex: 11,
    resolution: '清洁刀库传感器并重新校准刀位，连续换刀 50 次正常。',
    laborCost: 360,
    partsCost: 0,
    shared: true,
  },
  {
    title: '气压不足导致停机',
    description: '车间气压波动导致设备保护停机。',
    type: 'repair',
    priority: 'normal',
    status: 'closed',
    region: EAST,
    customerIndex: 0,
    deviceIndex: 0,
    resolution: '协助客户排查气源并加装稳压装置。',
    laborCost: 300,
    partsCost: 150,
  },
  {
    title: '导轨润滑不足',
    description: '巡检发现导轨润滑不足，存在磨损风险。',
    type: 'maintenance',
    priority: 'low',
    status: 'in_progress',
    region: EAST,
    customerIndex: 1,
    deviceIndex: 2,
  },
  {
    title: '紧急备件更换（保密）',
    description: '核心工艺设备故障，需更换定制备件，信息保密。',
    type: 'repair',
    priority: 'urgent',
    status: 'in_progress',
    region: SOUTH,
    customerIndex: 4,
    deviceIndex: 9,
    confidential: true,
    internalNotes: '备件由总部直接调拨，禁止对外披露。',
  },
  {
    title: '软件版本升级',
    description: '升级设备控制系统至最新稳定版本。',
    type: 'maintenance',
    priority: 'normal',
    status: 'pending_confirmation',
    region: EAST,
    customerIndex: 2,
    deviceIndex: 4,
    resolution: '已升级至 v3.4.2 并完成回归测试。',
    laborCost: 420,
    partsCost: 0,
  },
  {
    title: '重复报修已取消',
    description: '与工单重复，客户确认取消。',
    type: 'repair',
    priority: 'low',
    status: 'cancelled',
    region: SOUTH,
    customerIndex: 5,
    deviceIndex: 10,
    cancelled: true,
  },
  {
    title: '出厂前终检',
    description: '出厂前对设备进行终检并生成报告。',
    type: 'inspection',
    priority: 'normal',
    status: 'pending_assignment',
    region: EAST,
    customerIndex: 0,
    deviceIndex: 1,
    source: 'inspection',
  },
];

const ARTICLES = [
  {
    slug: 'kb-alarm-e021',
    title: 'E021 主控报警排查手册',
    summary: '从编码器线束、驱动器参数到电源模块的完整排查顺序。',
    category: 'repair',
    status: 'published',
    tags: ['报警', '主控', 'E021'],
    content:
      '1. 确认报警历史与触发条件。\n2. 检查编码器线束是否松动或破损。\n3. 复核驱动器参数与固件版本。\n4. 测量 24V 电源纹波。\n5. 记录处理结果并附上照片。',
  },
  {
    slug: 'kb-cooling-noise',
    title: '冷却系统异响的常见原因',
    summary: '区分水泵汽蚀、轴承磨损与管路共振三类异响。',
    category: 'repair',
    status: 'published',
    tags: ['冷却', '异响'],
    content:
      '异响处理应先判断声源：水泵汽蚀伴随流量下降，轴承磨损随转速变化，管路共振则与固定支架相关。逐一排除后更换对应部件。',
  },
  {
    slug: 'kb-safety-door',
    title: '安全门联锁检查规范',
    summary: '安全联锁失效时的停机与处置流程。',
    category: 'safety',
    status: 'published',
    tags: ['安全', '联锁'],
    content:
      '安全联锁属于强制项，一旦失效应立即停机并挂牌。确认门磁开关、继电器与控制器输入通道后，由主管复核方可恢复生产。',
  },
  {
    slug: 'kb-inspection-checklist',
    title: '日常巡检项目清单',
    summary: '每日巡检需要确认的十二个项目。',
    category: 'inspection',
    status: 'published',
    tags: ['巡检', '清单'],
    content:
      '润滑、气压、冷却液、过滤网、急停按钮、安全门、导轨、主轴温度、电缆、接地、清洁度、运行日志共十二项，逐项记录。',
  },
  {
    slug: 'kb-spare-parts',
    title: '常用备件清单（草稿）',
    summary: '整理中：常用备件型号与库存位置。',
    category: 'parts',
    status: 'draft',
    tags: ['备件'],
    content: '本清单仍在整理中，尚未发布。',
  },
  {
    slug: 'kb-service-sla',
    title: '服务响应时限说明（草稿）',
    summary: '整理中：不同优先级工单的响应与解决时限。',
    category: 'process',
    status: 'draft',
    tags: ['SLA', '流程'],
    content: '本说明仍在内部评审中，尚未发布。',
  },
] as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

function serialFor(region: string, index: number): string {
  const prefix = region === EAST ? 'ANL-E' : 'ANL-S';
  return `${prefix}-2024-${String(index + 1).padStart(3, '0')}`;
}

export default defineSeed({
  name: '202610010003_service_delivery_data',
  transaction: true,
  async run(context) {
    const { query } = context;
    const existing = await context.repository('service_customers').count({});
    if (existing > 0) return;

    const now = new Date();

    // Teams (created by the permission seed) keyed by code.
    const teamRows = await query
      .selectFrom('service_teams')
      .select(['id', 'code'])
      .execute();
    const teamIdByCode = new Map<string, number>();
    for (const row of teamRows) {
      teamIdByCode.set(String(row.code), Number(row.id));
    }

    const customerIds: number[] = [];
    for (const customer of CUSTOMERS) {
      const result = await context.repository('service_customers').createOne({
        values: {
          ...customer,
          teamId: teamIdByCode.get(customer.region) ?? null,
          status: 'active',
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      customerIds.push(Number(result.record.id));
    }

    const deviceIds: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const customerIndex = Math.floor(index / 2);
      const customer = CUSTOMERS[customerIndex];
      const result = await context.repository('service_devices').createOne({
        values: {
          serialNumber: serialFor(customer.region, index),
          name: `${customer.name}设备 ${String(index + 1).padStart(2, '0')}`,
          model: DEVICE_MODELS[index % DEVICE_MODELS.length],
          customerId: customerIds[customerIndex],
          region: customer.region,
          location: `${customer.address} 车间 ${index + 1}`,
          status: index === 10 ? 'maintenance' : 'in_service',
          installedAt: daysAgo(400 - index * 10),
          warrantyUntil: daysFromNow(200 - index * 20),
          enabled: index !== 11,
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      deviceIds.push(Number(result.record.id));
    }

    for (const article of ARTICLES) {
      await context.repository('service_knowledge_articles').createOne({
        values: {
          ...article,
          tags: [...article.tags],
          authorId: SUPERVISOR.id,
          authorName: SUPERVISOR.name,
          publishedAt: article.status === 'published' ? daysAgo(10) : null,
          viewCount: article.status === 'published' ? 12 : 0,
          createdAt: daysAgo(20),
          updatedAt: daysAgo(5),
        },
      });
    }

    // One inspection plan per enabled device, all on the same daily 9am rule.
    for (const deviceId of deviceIds) {
      const device = await context.repository('service_devices').findOne({
        filter: { id: deviceId },
      });
      if (!device || device.enabled !== true) continue;
      await context.repository('service_inspection_plans').createOne({
        values: {
          name: `${textValue(device.serialNumber)} 日常巡检`,
          deviceId,
          deviceSerial: textValue(device.serialNumber),
          cron: '0 9 * * *',
          timezone: 'Asia/Shanghai',
          enabled: true,
          taskType: 'inspection',
          lastRunAt: daysAgo(1),
          nextRunAt: daysFromNow(1),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // A little inspection history so the task page is not empty on delivery.
    const plans = await query
      .selectFrom('service_inspection_plans')
      .select(['id', 'deviceId', 'deviceSerial'])
      .orderBy('id', 'asc')
      .limit(5)
      .execute();
    for (const plan of plans) {
      await context.repository('service_inspection_tasks').createOne({
        values: {
          planId: Number(plan.id),
          deviceId: Number(plan.deviceId),
          deviceSerial: textValue(plan.deviceSerial),
          runDate: daysAgo(1).toISOString().slice(0, 10),
          status: 'done',
          triggeredBy: 'schedule',
          result: '巡检完成，运行参数正常。',
          startedAt: daysAgo(1),
          finishedAt: daysAgo(1),
          createdAt: daysAgo(1),
          updatedAt: daysAgo(1),
        },
      });
    }

    let sequence = 1;
    for (const spec of TICKETS) {
      const region = spec.region;
      const engineer = ENGINEERS[region];
      const reporter =
        spec.reporter === 'integration'
          ? INTEGRATION
          : spec.reporter === 'supervisor'
            ? SUPERVISOR
            : { id: 'svc-customer-portal', name: '客户报修 / Customer report' };
      const deviceId = deviceIds[spec.deviceIndex];
      const customerId = customerIds[spec.customerIndex];
      const serial = `${region === EAST ? 'WO-E' : 'WO-S'}-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      sequence += 1;
      const assigned =
        spec.status === 'draft' || spec.status === 'pending_assignment'
          ? null
          : engineer;
      const slaDueAt = spec.overdue
        ? daysAgo(1)
        : spec.status === 'closed' || spec.status === 'cancelled'
          ? null
          : daysFromNow(2);

      const result = await context.repository('service_tickets').createOne({
        values: {
          serial,
          title: spec.title,
          description: spec.description,
          type: spec.type,
          priority: spec.priority,
          status: spec.status,
          confidential: spec.confidential ?? false,
          customerId,
          customerName: CUSTOMERS[spec.customerIndex].name,
          deviceId,
          deviceSerial: serialFor(region, spec.deviceIndex),
          region,
          assigneeId: assigned?.id ?? null,
          assigneeName: assigned?.name ?? null,
          reporterId: reporter.id,
          reporterName: reporter.name,
          source: spec.source ?? 'manual',
          slaDueAt,
          submittedAt: spec.status === 'draft' ? null : daysAgo(6),
          assignedAt: assigned ? daysAgo(5) : null,
          startedAt: ['in_progress', 'pending_confirmation', 'closed'].includes(
            spec.status,
          )
            ? daysAgo(4)
            : null,
          resolvedAt: ['pending_confirmation', 'closed'].includes(spec.status)
            ? daysAgo(2)
            : null,
          confirmedAt: spec.status === 'closed' ? daysAgo(1) : null,
          closedAt: spec.status === 'closed' ? daysAgo(1) : null,
          cancelledAt: spec.cancelled ? daysAgo(3) : null,
          resolution: spec.resolution ?? null,
          cancelReason: spec.cancelled
            ? '与已有工单重复，客户确认取消。'
            : null,
          returnReason: null,
          laborCost: spec.laborCost ?? null,
          partsCost: spec.partsCost ?? null,
          internalNotes: spec.internalNotes ?? null,
          returnCount: 0,
          overdue: spec.overdue ?? false,
          createdAt: daysAgo(7),
          updatedAt: daysAgo(1),
        },
      });
      const ticketId = Number(result.record.id);

      const steps: Array<{
        kind: string;
        action: string;
        fromStatus: string | null;
        toStatus: string | null;
        step: string;
        stepStatus: string;
        content: string;
        actorId: string;
        actorName: string;
      }> = [
        {
          kind: 'system',
          action: 'create',
          fromStatus: null,
          toStatus: 'draft',
          step: 'create_ticket',
          stepStatus: 'success',
          content: '创建工单草稿。',
          actorId: reporter.id,
          actorName: reporter.name,
        },
        {
          kind: 'system',
          action: 'validate_device',
          fromStatus: null,
          toStatus: null,
          step: 'validate_device',
          stepStatus: 'success',
          content: `校验设备 ${serialFor(region, spec.deviceIndex)} 与客户归属。`,
          actorId: reporter.id,
          actorName: reporter.name,
        },
      ];
      if (spec.status !== 'draft') {
        steps.push(
          {
            kind: 'status',
            action: 'submit',
            fromStatus: 'draft',
            toStatus: 'pending_assignment',
            step: 'submit_ticket',
            stepStatus: 'success',
            content: '提交工单并进入待分派。',
            actorId: reporter.id,
            actorName: reporter.name,
          },
          {
            kind: 'system',
            action: 'assign_region',
            fromStatus: null,
            toStatus: null,
            step: 'match_region',
            stepStatus: 'success',
            content: `按区域 ${region} 匹配服务组。`,
            actorId: SUPERVISOR.id,
            actorName: SUPERVISOR.name,
          },
        );
      }
      if (assigned) {
        steps.push({
          kind: 'status',
          action: 'assign',
          fromStatus: 'pending_assignment',
          toStatus: spec.status === 'draft' ? 'draft' : 'in_progress',
          step: 'assign_engineer',
          stepStatus: 'success',
          content: `分派给 ${assigned.name}。`,
          actorId: SUPERVISOR.id,
          actorName: SUPERVISOR.name,
        });
      }
      if (['pending_confirmation', 'closed'].includes(spec.status)) {
        steps.push({
          kind: 'status',
          action: 'resolve',
          fromStatus: 'in_progress',
          toStatus: 'pending_confirmation',
          step: 'resolve_ticket',
          stepStatus: 'success',
          content: spec.resolution ?? '处理完成，等待客户确认。',
          actorId: engineer.id,
          actorName: engineer.name,
        });
      }
      if (spec.status === 'closed') {
        steps.push({
          kind: 'status',
          action: 'confirm',
          fromStatus: 'pending_confirmation',
          toStatus: 'closed',
          step: 'confirm_ticket',
          stepStatus: 'success',
          content: '客户确认关闭工单。',
          actorId: SUPERVISOR.id,
          actorName: SUPERVISOR.name,
        });
      }
      if (spec.cancelled) {
        steps.push({
          kind: 'status',
          action: 'cancel',
          fromStatus: 'pending_assignment',
          toStatus: 'cancelled',
          step: 'cancel_ticket',
          stepStatus: 'success',
          content: '与已有工单重复，客户确认取消。',
          actorId: SUPERVISOR.id,
          actorName: SUPERVISOR.name,
        });
      }
      for (const step of steps) {
        await context.repository('service_ticket_logs').createOne({
          values: {
            ...step,
            ticketId,
            metadata: null,
            requestKey: null,
            createdAt: daysAgo(7),
            updatedAt: daysAgo(7),
          },
        });
      }

      // Cross-region collaboration: explicit shares, never for confidential.
      if (spec.shared && !spec.confidential) {
        await context.repository('service_ticket_shares').createOne({
          values: {
            ticketId,
            userId: COLLABORATOR.id,
            userName: COLLABORATOR.name,
            permission: 'comment',
            reason: '跨区域技术支援',
            sharedById: SUPERVISOR.id,
            sharedByName: SUPERVISOR.name,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }
  },
});
