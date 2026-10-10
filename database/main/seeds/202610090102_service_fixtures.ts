import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * Delivered demonstration data: three customers, six devices, six orders that
 * cover every lifecycle state, one planned inspection, two published/draft
 * knowledge entries and two device manuals.
 *
 * Every row is found by its natural key first, so a repeat run adds nothing.
 * Timestamps are fixed strings rather than `new Date()`: a seed's identifying
 * data must be reproducible, and the fixtures are read in a demo, not produced
 * by a job.
 */

const T = (day: string): Date => new Date(`${day}T02:00:00.000Z`);

interface CustomerFixture {
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly address: string;
}

const CUSTOMERS: readonly CustomerFixture[] = [
  {
    name: '上海精密制造有限公司',
    contactName: '王海',
    contactPhone: '021-58001122',
    address: '上海市浦东新区张江路 88 号',
  },
  {
    name: '苏州光电科技股份有限公司',
    contactName: '李倩',
    contactPhone: '0512-66889900',
    address: '江苏省苏州市工业园区星湖街 328 号',
  },
  {
    name: '杭州生物仪器有限公司',
    contactName: '陈磊',
    contactPhone: '0571-88776655',
    address: '浙江省杭州市滨江区江南大道 588 号',
  },
];

interface DeviceFixture {
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly customer: string;
  readonly groupCode: string;
  readonly engineerEmail: string;
  readonly nextInspectionDate: string;
}

const DEVICES: readonly DeviceFixture[] = [
  {
    code: 'DEV-1001',
    name: '数控加工中心 A1',
    model: 'CNC-800A',
    customer: '上海精密制造有限公司',
    groupCode: 'group-a',
    engineerEmail: 'engineer.one@example.com',
    nextInspectionDate: '2026-10-20',
  },
  {
    code: 'DEV-1002',
    name: '数控加工中心 A2',
    model: 'CNC-800A',
    customer: '上海精密制造有限公司',
    groupCode: 'group-a',
    engineerEmail: 'engineer.one@example.com',
    nextInspectionDate: '2026-11-05',
  },
  {
    code: 'DEV-2001',
    name: '激光刻蚀机 L1',
    model: 'LASER-2200',
    customer: '苏州光电科技股份有限公司',
    groupCode: 'group-a',
    engineerEmail: 'engineer.one@example.com',
    nextInspectionDate: '2026-10-12',
  },
  {
    code: 'DEV-2002',
    name: '激光刻蚀机 L2',
    model: 'LASER-2200',
    customer: '苏州光电科技股份有限公司',
    groupCode: 'group-b',
    engineerEmail: 'engineer.two@example.com',
    nextInspectionDate: '2026-12-01',
  },
  {
    code: 'DEV-3001',
    name: '高效液相色谱仪 H1',
    model: 'HPLC-5000',
    customer: '杭州生物仪器有限公司',
    groupCode: 'group-b',
    engineerEmail: 'engineer.two@example.com',
    nextInspectionDate: '2026-10-09',
  },
  {
    code: 'DEV-3002',
    name: '高效液相色谱仪 H2',
    model: 'HPLC-5000',
    customer: '杭州生物仪器有限公司',
    groupCode: 'group-b',
    engineerEmail: 'engineer.two@example.com',
    nextInspectionDate: '2027-01-15',
  },
];

interface OrderFixture {
  readonly orderNo: string;
  readonly title: string;
  readonly device: string;
  readonly description: string;
  readonly priority: string;
  readonly status: string;
  readonly assigneeEmail: string | null;
  readonly groupCode: string | null;
  readonly confidential?: boolean;
  readonly observerVisible?: boolean;
  readonly dueAt: string;
  readonly createdAt: string;
  readonly acceptanceNote?: string;
  readonly resolution?: string;
  readonly returnReason?: string;
  readonly acceptedAt?: string;
  readonly processingAt?: string;
  readonly submittedAt?: string;
  readonly closedAt?: string;
}

const ORDERS: readonly OrderFixture[] = [
  {
    orderNo: 'SO-2026-1001',
    title: 'A1 主轴异响，需要现场排查',
    device: 'DEV-1001',
    description:
      '客户反馈主轴在高速旋转时有周期性异响，转速 8000rpm 以上明显。',
    priority: 'high',
    status: 'pending_acceptance',
    assigneeEmail: null,
    groupCode: null,
    dueAt: '2026-10-12T09:00:00.000Z',
    createdAt: '2026-10-08T01:20:00.000Z',
  },
  {
    orderNo: 'SO-2026-1002',
    title: 'A2 冷却系统压力不足',
    device: 'DEV-1002',
    description: '冷却液压力低于 0.3MPa，加工中心自动停机。',
    priority: 'normal',
    status: 'pending_processing',
    assigneeEmail: 'engineer.one@example.com',
    groupCode: 'group-a',
    dueAt: '2026-10-13T09:00:00.000Z',
    createdAt: '2026-10-07T03:10:00.000Z',
    acceptedAt: '2026-10-07T04:00:00.000Z',
    acceptanceNote: '已接单，携带压力表与备件前往现场。',
  },
  {
    orderNo: 'SO-2026-1003',
    title: 'L1 光路偏移导致刻蚀偏差',
    device: 'DEV-2001',
    description: '刻蚀线宽偏差超过 5%，怀疑光学镜片需要重新校准。',
    priority: 'high',
    status: 'processing',
    assigneeEmail: 'engineer.one@example.com',
    groupCode: 'group-a',
    dueAt: '2026-10-10T09:00:00.000Z',
    createdAt: '2026-10-05T06:30:00.000Z',
    acceptedAt: '2026-10-05T07:00:00.000Z',
    processingAt: '2026-10-06T01:00:00.000Z',
    acceptanceNote: '已接单，先做光路标定。',
  },
  {
    orderNo: 'SO-2026-1004',
    title: 'L2 工作台定位精度超差',
    device: 'DEV-2002',
    description: '重复定位精度 0.05mm，超出出厂标准。',
    priority: 'normal',
    status: 'pending_confirmation',
    assigneeEmail: 'engineer.two@example.com',
    groupCode: 'group-b',
    dueAt: '2026-10-09T09:00:00.000Z',
    createdAt: '2026-10-03T02:00:00.000Z',
    acceptedAt: '2026-10-03T02:30:00.000Z',
    processingAt: '2026-10-04T01:00:00.000Z',
    submittedAt: '2026-10-06T08:00:00.000Z',
    resolution:
      '重新锁紧导轨并完成丝杠反向间隙补偿，重复定位精度恢复到 0.008mm。',
  },
  {
    orderNo: 'SO-2026-1005',
    title: 'H1 检测器基线漂移',
    device: 'DEV-3001',
    description: '基线持续漂移，标准品峰面积重复性不达标。',
    priority: 'normal',
    status: 'closed',
    assigneeEmail: 'engineer.two@example.com',
    groupCode: 'group-b',
    observerVisible: true,
    dueAt: '2026-10-02T09:00:00.000Z',
    createdAt: '2026-09-28T02:00:00.000Z',
    acceptedAt: '2026-09-28T03:00:00.000Z',
    processingAt: '2026-09-29T01:00:00.000Z',
    submittedAt: '2026-09-30T06:00:00.000Z',
    closedAt: '2026-10-01T02:00:00.000Z',
    resolution: '更换氘灯并做波长校准，基线漂移恢复到验收标准以内。',
  },
  {
    orderNo: 'SO-2026-1006',
    title: 'H2 进样针堵塞（客户保密）',
    device: 'DEV-3002',
    description: '客户要求该工单内容不对外披露，进样针疑似堵塞。',
    priority: 'urgent',
    status: 'pending_acceptance',
    assigneeEmail: null,
    groupCode: null,
    confidential: true,
    dueAt: '2026-10-09T09:00:00.000Z',
    createdAt: '2026-10-08T07:40:00.000Z',
  },
];

const MANUALS = [
  {
    title: 'CNC-800A 数控加工中心维护手册',
    fileName: 'cnc-800a-maintenance.md',
    device: 'DEV-1001',
    content: [
      '# CNC-800A 数控加工中心维护手册',
      '',
      '## 日常检查',
      '',
      '- 每班检查冷却液液位与压力，正常范围 0.35–0.5MPa。',
      '- 检查主轴异响：8000rpm 以上出现周期性噪声时停机检查轴承。',
      '- 清理导轨防护罩内的切屑。',
      '',
      '## 主轴异响排查',
      '',
      '1. 记录异响出现的转速区间。',
      '2. 脱开刀柄空转，确认噪声是否来自主轴本体。',
      '3. 检测主轴径向跳动，超过 0.01mm 需返厂维修。',
      '4. 检查拉刀机构弹簧预紧力。',
      '',
      '## 冷却系统压力不足',
      '',
      '1. 检查冷却液液位与过滤网。',
      '2. 测量泵出口压力，低于 0.3MPa 时检查泵体与溢流阀。',
      '3. 确认管路无泄漏后重新排气。',
    ].join('\n'),
  },
  {
    title: 'HPLC-5000 高效液相色谱仪维护手册',
    fileName: 'hplc-5000-maintenance.md',
    device: 'DEV-3001',
    content: [
      '# HPLC-5000 高效液相色谱仪维护手册',
      '',
      '## 基线漂移排查',
      '',
      '1. 确认流动相已脱气 15 分钟以上。',
      '2. 检查检测器氘灯使用时长，超过 2000 小时建议更换。',
      '3. 执行波长校准，记录 254nm 能量值。',
      '4. 若漂移仍存在，冲洗色谱柱并做空白运行。',
      '',
      '## 进样针堵塞处理',
      '',
      '1. 取下进样针，用甲醇超声清洗 10 分钟。',
      '2. 检查针尖是否变形，变形需更换。',
      '3. 复位后执行三次进样重复性测试，RSD 应小于 1%。',
    ].join('\n'),
  },
];

interface KnowledgeFixture {
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly content: string;
}

const KNOWLEDGE_FIXTURES: readonly KnowledgeFixture[] = [
  {
    title: '数控加工中心主轴异响处理经验',
    category: 'cnc',
    status: 'published',
    content: [
      '主轴异响多数来自轴承磨损或拉刀机构弹簧预紧力不足。',
      '',
      '排查顺序：先记录异响转速区间，再脱开刀柄空转定位声源，',
      '最后测量径向跳动。跳动超过 0.01mm 时安排返厂维修。',
    ].join('\n'),
  },
  {
    title: '激光刻蚀机光路标定草稿',
    category: 'laser',
    status: 'draft',
    content: [
      '草稿：待补充不同功率下的标定参数与偏差修正记录。',
      '',
      '目前记录：功率 60% 时刻蚀线宽偏差超过 5%，需要重新校准镜片。',
    ].join('\n'),
  },
];

interface IdRow {
  id: number;
}

async function findId(
  context: SeedContext,
  collection: string,
  filter: Record<string, unknown>,
): Promise<number | undefined> {
  const repository = context.repository<IdRow>(collection);
  const row = await repository.findOne({ filter: filter as never });
  return row?.id;
}

const seed = defineSeed({
  name: '202610090102_service_fixtures',
  async run(context) {
    const groups = context.repository<{ id: number; code: string }>(
      'service_groups',
    );
    const groupIds = new Map<string, number>();
    for (const code of ['group-a', 'group-b']) {
      const group = await groups.findOne({ filter: { code } });
      if (group) {
        groupIds.set(code, group.id);
      }
    }

    const userIds = new Map<string, string>();
    for (const email of [
      'service.supervisor@example.com',
      'engineer.one@example.com',
      'engineer.two@example.com',
      'observer@example.com',
    ]) {
      const user = await context.query
        .selectFrom('user')
        .select('id')
        .where('email', '=', email)
        .limit(1)
        .executeTakeFirst();
      if (user) {
        userIds.set(email, String(user.id));
      }
    }
    const supervisorId = userIds.get('service.supervisor@example.com') ?? null;

    const customerIds = new Map<string, number>();
    for (const fixture of CUSTOMERS) {
      const existing = await findId(context, 'customers', {
        name: fixture.name,
      });
      if (existing !== undefined) {
        customerIds.set(fixture.name, existing);
        continue;
      }
      const now = T('2026-09-01');
      const created = await context.repository('customers').createOne({
        values: {
          name: fixture.name,
          contactName: fixture.contactName,
          contactPhone: fixture.contactPhone,
          address: fixture.address,
          remark: null,
          createdAt: now,
          updatedAt: now,
        } as never,
      });
      customerIds.set(fixture.name, Number(created.record.id));
    }

    const deviceIds = new Map<string, number>();
    for (const fixture of DEVICES) {
      const existing = await findId(context, 'devices', { code: fixture.code });
      if (existing !== undefined) {
        deviceIds.set(fixture.code, existing);
        continue;
      }
      const now = T('2026-09-02');
      const created = await context.repository('devices').createOne({
        values: {
          code: fixture.code,
          name: fixture.name,
          model: fixture.model,
          customerId: customerIds.get(fixture.customer),
          engineerId: userIds.get(fixture.engineerEmail) ?? null,
          groupId: groupIds.get(fixture.groupCode) ?? null,
          enabled: true,
          nextInspectionDate: new Date(
            `${fixture.nextInspectionDate}T00:00:00.000Z`,
          ),
          createdAt: now,
          updatedAt: now,
        } as never,
      });
      deviceIds.set(fixture.code, Number(created.record.id));
    }

    const logs = context.repository('service_order_logs');
    const orderIds = new Map<string, number>();
    for (const fixture of ORDERS) {
      const existing = await findId(context, 'service_orders', {
        orderNo: fixture.orderNo,
      });
      if (existing !== undefined) {
        orderIds.set(fixture.orderNo, existing);
        continue;
      }
      const createdAt = new Date(fixture.createdAt);
      const created = await context.repository('service_orders').createOne({
        values: {
          orderNo: fixture.orderNo,
          title: fixture.title,
          customerId: customerIds.get(
            DEVICES.find((device) => device.code === fixture.device)
              ?.customer ?? '',
          ),
          deviceId: deviceIds.get(fixture.device),
          description: fixture.description,
          priority: fixture.priority,
          dueAt: new Date(fixture.dueAt),
          assigneeId: fixture.assigneeEmail
            ? (userIds.get(fixture.assigneeEmail) ?? null)
            : null,
          groupId: fixture.groupCode
            ? (groupIds.get(fixture.groupCode) ?? null)
            : null,
          confidential: fixture.confidential ?? false,
          status: fixture.status,
          acceptanceNote: fixture.acceptanceNote ?? null,
          resolution: fixture.resolution ?? null,
          returnReason: fixture.returnReason ?? null,
          acceptedAt: fixture.acceptedAt ? new Date(fixture.acceptedAt) : null,
          processingAt: fixture.processingAt
            ? new Date(fixture.processingAt)
            : null,
          submittedAt: fixture.submittedAt
            ? new Date(fixture.submittedAt)
            : null,
          closedAt: fixture.closedAt ? new Date(fixture.closedAt) : null,
          createdById: supervisorId,
          source: 'internal',
          externalEventId: null,
          observerVisible: fixture.observerVisible ?? false,
          createdAt,
          updatedAt: createdAt,
        } as never,
      });
      const orderId = Number(created.record.id);
      orderIds.set(fixture.orderNo, orderId);

      // The audit trail the business routes would have written, so the timeline
      // of a demo order is as complete as a real one.
      const entries: Array<{ action: string; message: string; at: string }> = [
        {
          action: 'create',
          message: `工单 ${fixture.orderNo} 已创建`,
          at: fixture.createdAt,
        },
      ];
      if (fixture.acceptedAt) {
        entries.push({
          action: 'accept',
          message: '工单已受理',
          at: fixture.acceptedAt,
        });
      }
      if (fixture.processingAt) {
        entries.push({
          action: 'start',
          message: '开始处理',
          at: fixture.processingAt,
        });
      }
      if (fixture.submittedAt) {
        entries.push({
          action: 'submit',
          message: '已提交处理结果，等待客户确认',
          at: fixture.submittedAt,
        });
      }
      if (fixture.closedAt) {
        entries.push({
          action: 'confirm',
          message: '客户确认，工单关闭',
          at: fixture.closedAt,
        });
      }
      for (const entry of entries) {
        const at = new Date(entry.at);
        await logs.createOne({
          values: {
            orderId,
            action: entry.action,
            status: fixture.status,
            message: entry.message,
            detail: null,
            actorId: supervisorId,
            idempotencyKey: `seed:${fixture.orderNo}:${entry.action}`,
            startedAt: at,
            finishedAt: at,
            createdAt: at,
          } as never,
        });
      }
    }

    // One inspection that the daily scan would have planned, and one temporary
    // collaboration share on an in-progress order.
    const inspectionKey = 'inspection:DEV-1001:2026-10-09';
    const inspections = context.repository('service_inspections');
    const existingInspection = await inspections.findOne({
      filter: { idempotencyKey: inspectionKey },
    });
    if (!existingInspection) {
      const now = T('2026-10-09');
      await inspections.createOne({
        values: {
          deviceId: deviceIds.get('DEV-1001'),
          assigneeId: userIds.get('engineer.one@example.com') ?? null,
          plannedDate: new Date('2026-10-09T00:00:00.000Z'),
          status: 'pending',
          result: null,
          resultCode: null,
          completedAt: null,
          source: 'scheduler',
          idempotencyKey: inspectionKey,
          createdAt: now,
          updatedAt: now,
        } as never,
      });
    }

    const sharedOrderId = orderIds.get('SO-2026-1003');
    const engineerTwoId = userIds.get('engineer.two@example.com');
    if (sharedOrderId !== undefined && engineerTwoId && supervisorId) {
      const shares = context.repository('service_order_shares');
      const existingShare = await shares.findOne({
        filter: { orderId: sharedOrderId, engineerId: engineerTwoId },
      });
      if (!existingShare) {
        const now = T('2026-10-06');
        await shares.createOne({
          values: {
            orderId: sharedOrderId,
            engineerId: engineerTwoId,
            grantedById: supervisorId,
            note: '光路标定需要乙组支援，临时共享该工单。',
            // The seeded share is temporary too: it lapses on its own if nobody
            // revokes it, which is the case the client displays.
            expiresAt: '2026-12-31T00:00:00.000Z',
            revokedAt: null,
            createdAt: now,
            updatedAt: now,
          } as never,
        });
      }
    }

    const knowledge = context.repository('repair_knowledge');
    for (const fixture of KNOWLEDGE_FIXTURES) {
      const existing = await knowledge.findOne({
        filter: { title: fixture.title },
      });
      if (existing) {
        continue;
      }
      const published = fixture.status === 'published';
      const now = T(published ? '2026-09-20' : '2026-10-04');
      await knowledge.createOne({
        values: {
          title: fixture.title,
          content: fixture.content,
          category: fixture.category,
          status: fixture.status,
          authorId: supervisorId,
          publishedAt: published ? now : null,
          createdAt: now,
          updatedAt: now,
        } as never,
      });
    }

    const manuals = context.repository('device_manuals');
    for (const fixture of MANUALS) {
      const existing = await manuals.findOne({
        filter: { fileName: fixture.fileName },
      });
      if (existing) {
        continue;
      }
      const now = T('2026-09-25');
      // `uploaded` means the document is stored and no ingestion has been
      // attempted yet. The seed does not claim a knowledge-base state it did not
      // observe: the reindex route or the scan job records the real outcome.
      await manuals.createOne({
        values: {
          title: fixture.title,
          fileName: fixture.fileName,
          content: fixture.content,
          deviceId: deviceIds.get(fixture.device) ?? null,
          status: 'uploaded',
          failureReason: null,
          aiDocumentId: null,
          uploadedById: supervisorId,
          createdAt: now,
          updatedAt: now,
        } as never,
      });
    }
  },
});

export default seed;
