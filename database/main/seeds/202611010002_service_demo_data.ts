import { defineSeed } from '@nocobase/db';

/**
 * Fixed demonstration data for the after-sales service module.
 *
 * The data is deliberately fixed and reproducible: identifying fields such as
 * order numbers, equipment codes and e-mail addresses never contain the current
 * time or random values. Every write is guarded by a logical uniqueness check,
 * so re-running the seed neither duplicates rows nor overwrites edits made in
 * the application.
 *
 * Real signed-in accounts are not created here. A seed cannot hash a password
 * through Better Auth, so it writes engineer *seats* keyed by e-mail and the
 * provisioning provider links each seat to the account it creates.
 */
const seed = defineSeed({
  name: '202611010002_service_demo_data',
  async run(context) {
    const now = new Date();

    const ensure = async (
      collection: string,
      unique: Record<string, unknown>,
      values: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      // The demo data is written through a logical uniqueness check. The seed
      // runtime's filter and values types are narrower than a plain object of
      // column values, so the two entry points are described structurally here.
      const repo = context.repository(collection) as unknown as {
        findOne(options: {
          filter: Record<string, unknown>;
        }): Promise<Record<string, unknown> | undefined>;
        createOne(options: {
          values: Record<string, unknown>;
        }): Promise<{ record: Record<string, unknown> }>;
      };
      const existing = await repo.findOne({ filter: unique });
      if (existing) {
        return existing;
      }
      const created = await repo.createOne({ values: { ...values } });
      return created.record;
    };

    // ---- Engineer groups and seats -------------------------------------
    const groupA = await ensure(
      'serviceEngineerGroups',
      { ref: 'group-a' },
      { ref: 'group-a', name: '售后一组', createdAt: now, updatedAt: now },
    );
    const groupB = await ensure(
      'serviceEngineerGroups',
      { ref: 'group-b' },
      { ref: 'group-b', name: '售后二组', createdAt: now, updatedAt: now },
    );

    const seats: ReadonlyArray<{
      readonly ref: string;
      readonly kind: string;
      readonly groupId: number;
      readonly name: string;
      readonly email: string;
    }> = [
      {
        ref: 'seat-manager',
        kind: 'manager',
        groupId: Number(groupA.id),
        name: '服务主管',
        email: 'service.manager@example.com',
      },
      {
        ref: 'seat-engineer-a',
        kind: 'engineer',
        groupId: Number(groupA.id),
        name: '张工',
        email: 'service.engineer.a@example.com',
      },
      {
        ref: 'seat-engineer-b',
        kind: 'engineer',
        groupId: Number(groupB.id),
        name: '李工',
        email: 'service.engineer.b@example.com',
      },
      {
        ref: 'seat-observer',
        kind: 'observer',
        groupId: Number(groupA.id),
        name: '只读观察员',
        email: 'service.observer@example.com',
      },
      {
        ref: 'seat-integrator',
        kind: 'integrator',
        groupId: Number(groupB.id),
        name: '设备平台集成账号',
        email: 'service.integrator@example.com',
      },
    ];
    const seatIds: Record<string, number> = {};
    for (const seat of seats) {
      const row = await ensure(
        'serviceEngineerMembers',
        { ref: seat.ref },
        {
          ref: seat.ref,
          kind: seat.kind,
          groupId: seat.groupId,
          name: seat.name,
          email: seat.email,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      );
      seatIds[seat.ref] = Number(row.id);
    }

    // ---- Customers -----------------------------------------------------
    const customers: ReadonlyArray<{
      readonly key: string;
      readonly name: string;
      readonly contactName: string;
      readonly contactPhone: string;
      readonly address: string;
    }> = [
      {
        key: 'customer-east',
        name: '华东精密制造有限公司',
        contactName: '王建国',
        contactPhone: '13800001001',
        address: '江苏省苏州市工业园区星湖街 218 号',
      },
      {
        key: 'customer-south',
        name: '南方物流装备集团',
        contactName: '陈敏',
        contactPhone: '13800001002',
        address: '广东省广州市黄埔区开发大道 88 号',
      },
      {
        key: 'customer-north',
        name: '北方能源科技有限公司',
        contactName: '赵磊',
        contactPhone: '13800001003',
        address: '北京市大兴区经济技术开发区兴业路 16 号',
      },
    ];
    const customerIds: Record<string, number> = {};
    for (const customer of customers) {
      const row = await ensure(
        'serviceCustomers',
        { name: customer.name },
        {
          name: customer.name,
          contactName: customer.contactName,
          contactPhone: customer.contactPhone,
          address: customer.address,
          createdAt: now,
          updatedAt: now,
        },
      );
      customerIds[customer.key] = Number(row.id);
    }

    // ---- Equipment -----------------------------------------------------
    const equipment: ReadonlyArray<{
      readonly key: string;
      readonly code: string;
      readonly name: string;
      readonly model: string;
      readonly location: string;
      readonly customerKey: string;
      readonly seatRef: string;
      readonly enabled: boolean;
      readonly nextInspectionDate: string;
    }> = [
      {
        key: 'equipment-cnc',
        code: 'EQ-1001',
        name: '数控加工中心',
        model: 'CNC-850',
        location: '苏州一车间',
        customerKey: 'customer-east',
        seatRef: 'seat-engineer-a',
        enabled: true,
        nextInspectionDate: '2026-12-01',
      },
      {
        key: 'equipment-chiller',
        code: 'EQ-1002',
        name: '工业冷水机组',
        model: 'CH-300',
        location: '苏州动力房',
        customerKey: 'customer-east',
        seatRef: 'seat-engineer-a',
        enabled: true,
        nextInspectionDate: '2026-11-20',
      },
      {
        key: 'equipment-sorter',
        code: 'EQ-1003',
        name: '自动分拣线',
        model: 'SORT-2',
        location: '广州分拨中心',
        customerKey: 'customer-south',
        seatRef: 'seat-engineer-b',
        enabled: true,
        nextInspectionDate: '2026-11-25',
      },
      {
        key: 'equipment-warehouse',
        code: 'EQ-1004',
        name: '恒温仓储机组',
        model: 'WH-90',
        location: '广州保税仓',
        customerKey: 'customer-south',
        seatRef: 'seat-engineer-b',
        enabled: true,
        nextInspectionDate: '2026-12-05',
      },
      {
        key: 'equipment-inverter',
        code: 'EQ-1005',
        name: '光伏逆变柜',
        model: 'PCS-500',
        location: '北京顺义电站',
        customerKey: 'customer-north',
        seatRef: 'seat-engineer-a',
        enabled: true,
        nextInspectionDate: '2026-12-10',
      },
      {
        key: 'equipment-compressor',
        code: 'EQ-1006',
        name: '老旧空压机',
        model: 'AC-120',
        location: '北京旧厂区',
        customerKey: 'customer-north',
        seatRef: 'seat-engineer-a',
        enabled: false,
        nextInspectionDate: '2026-06-30',
      },
    ];
    const equipmentIds: Record<string, number> = {};
    for (const item of equipment) {
      const row = await ensure(
        'serviceEquipment',
        { code: item.code },
        {
          code: item.code,
          name: item.name,
          model: item.model,
          location: item.location,
          customerId: customerIds[item.customerKey],
          engineerMemberId: seatIds[item.seatRef],
          enabled: item.enabled,
          nextInspectionDate: item.nextInspectionDate,
          createdAt: now,
          updatedAt: now,
        },
      );
      equipmentIds[item.key] = Number(row.id);
    }

    // ---- Work orders ---------------------------------------------------
    const workOrders: ReadonlyArray<{
      readonly orderNo: string;
      readonly title: string;
      readonly customerKey: string;
      readonly equipmentKey: string;
      readonly problem: string;
      readonly priority: 'normal' | 'urgent';
      readonly status: string;
      readonly seatRef: string;
      readonly confidential: boolean;
      readonly deadlineDays: number | null;
      readonly acceptanceNote?: string;
      readonly resolution?: string;
      readonly rejectReason?: string;
      readonly rejectCount?: number;
    }> = [
      {
        orderNo: 'WO-2026-0001',
        title: '冷水机组高压报警停机',
        customerKey: 'customer-east',
        equipmentKey: 'equipment-chiller',
        problem:
          '客户反馈冷水机组连续两次高压报警并自动停机，冷却水流量正常，需现场排查冷凝器与压力传感器。',
        priority: 'urgent',
        status: 'pending_acceptance',
        seatRef: 'seat-engineer-a',
        confidential: false,
        deadlineDays: 1,
      },
      {
        orderNo: 'WO-2026-0002',
        title: '加工中心主轴异响',
        customerKey: 'customer-east',
        equipmentKey: 'equipment-cnc',
        problem:
          '加工中心主轴在 8000 转以上出现周期性异响，怀疑主轴轴承磨损，需要检查并更换。',
        priority: 'normal',
        status: 'pending_processing',
        seatRef: 'seat-engineer-a',
        confidential: false,
        deadlineDays: 7,
      },
      {
        orderNo: 'WO-2026-0003',
        title: '分拣线光电开关误触发',
        customerKey: 'customer-south',
        equipmentKey: 'equipment-sorter',
        problem:
          '分拣线 3 号口光电开关频繁误触发，导致包裹分拣错误，已临时停机等待处理。',
        priority: 'urgent',
        status: 'processing',
        seatRef: 'seat-engineer-b',
        confidential: false,
        deadlineDays: 2,
      },
      {
        orderNo: 'WO-2026-0004',
        title: '仓储机组制冷量不足',
        customerKey: 'customer-south',
        equipmentKey: 'equipment-warehouse',
        problem:
          '恒温仓储机组库温只能降到 12℃，达不到设定值 8℃，怀疑制冷剂不足。',
        priority: 'normal',
        status: 'pending_confirmation',
        seatRef: 'seat-engineer-b',
        confidential: false,
        deadlineDays: 5,
        resolution:
          '补充 R410A 制冷剂 2.1kg，检漏未发现泄漏点，复测库温 4 小时稳定在 7.5℃，压缩机运行电流正常。',
      },
      {
        orderNo: 'WO-2026-0005',
        title: '空压机机头漏油（历史工单）',
        customerKey: 'customer-north',
        equipmentKey: 'equipment-compressor',
        problem: '空压机机头密封处渗油，地面有油迹。',
        priority: 'normal',
        status: 'closed',
        seatRef: 'seat-engineer-a',
        confidential: false,
        deadlineDays: 10,
        acceptanceNote: '普通工单已受理，按常规排期上门处理。',
        resolution:
          '更换机头油封并补加专用润滑油 3L，连续试运行 2 小时无渗漏。',
      },
      {
        orderNo: 'WO-2026-0006',
        title: '逆变柜通讯中断（内部工单）',
        customerKey: 'customer-north',
        equipmentKey: 'equipment-inverter',
        problem:
          '逆变柜上行通讯每日凌晨中断约 10 分钟，涉及电站运行数据，处理过程与数据仅限内部人员查看。',
        priority: 'normal',
        status: 'pending_processing',
        seatRef: 'seat-engineer-a',
        confidential: true,
        deadlineDays: 3,
      },
    ];
    for (const order of workOrders) {
      await ensure(
        'serviceWorkOrders',
        { orderNo: order.orderNo },
        {
          orderNo: order.orderNo,
          title: order.title,
          customerId: customerIds[order.customerKey],
          equipmentId: equipmentIds[order.equipmentKey],
          problem: order.problem,
          priority: order.priority,
          status: order.status,
          assigneeId: seatIds[order.seatRef],
          confidential: order.confidential,
          deadline:
            order.deadlineDays === null
              ? null
              : new Date(
                  now.getTime() + order.deadlineDays * 24 * 60 * 60 * 1000,
                ),
          acceptanceNote: order.acceptanceNote ?? null,
          acceptedAt: order.status === 'pending_acceptance' ? null : now,
          processingStartedAt:
            order.status === 'processing' ||
            order.status === 'pending_confirmation'
              ? now
              : null,
          resolution: order.resolution ?? null,
          resolutionAt:
            order.status === 'pending_confirmation' || order.status === 'closed'
              ? now
              : null,
          resolutionSubmittedById:
            order.status === 'pending_confirmation' || order.status === 'closed'
              ? seatIds[order.seatRef]
              : null,
          closedAt: order.status === 'closed' ? now : null,
          closedById:
            order.status === 'closed' ? seatIds['seat-manager'] : null,
          rejectCount: order.rejectCount ?? 0,
          lastRejectReason: order.rejectReason ?? null,
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        },
      );
    }

    // ---- One seeded inspection task ------------------------------------
    await ensure(
      'serviceInspectionTasks',
      { taskNo: 'INSP-2026-0001' },
      {
        taskNo: 'INSP-2026-0001',
        equipmentId: equipmentIds['equipment-chiller'],
        customerId: customerIds['customer-east'],
        engineerMemberId: seatIds['seat-engineer-a'],
        planDate: '2026-11-20',
        dueAt: new Date('2026-11-20T09:00:00.000Z'),
        status: 'pending',
        occurrenceKey: 'seed:inspection-chiller-2026-11-20',
        createdAt: now,
        updatedAt: now,
      },
    );

    // ---- Knowledge articles --------------------------------------------
    await ensure(
      'serviceKnowledgeArticles',
      { title: '工业冷水机组高压报警处理手册' },
      {
        title: '工业冷水机组高压报警处理手册',
        body: [
          '1. 记录报警代码与当时的高压值、冷凝温度。',
          '2. 检查冷却水流量与水温，确认冷却塔风机运行正常。',
          '3. 检查冷凝器翅片是否积灰，必要时清洗。',
          '4. 检测高压压力传感器输出电压是否与环境压力一致，偏差超过 5% 需更换。',
          '5. 处理完成后连续观察 30 分钟，压力稳定后关闭工单。',
        ].join('\n'),
        published: true,
        createdAt: now,
        updatedAt: now,
      },
    );
    await ensure(
      'serviceKnowledgeArticles',
      { title: '分拣线光电开关误触发排查（草稿）' },
      {
        title: '分拣线光电开关误触发排查（草稿）',
        body: '草稿：待补充现场实测数据后再发布。初步怀疑反光板污染与信号线屏蔽层接地不良。',
        published: false,
        createdAt: now,
        updatedAt: now,
      },
    );

    // ---- Manuals -------------------------------------------------------
    await ensure(
      'serviceManuals',
      { title: 'CNC-850 数控加工中心维护手册' },
      {
        title: 'CNC-850 数控加工中心维护手册',
        equipmentModel: 'CNC-850',
        summary: '包含主轴维护、润滑周期与常见报警处理章节。',
        indexStatus: 'not_indexed',
        createdAt: now,
        updatedAt: now,
      },
    );
    await ensure(
      'serviceManuals',
      { title: 'CH-300 冷水机组安装调试手册' },
      {
        title: 'CH-300 冷水机组安装调试手册',
        equipmentModel: 'CH-300',
        summary: '包含管路连接、压力参数设定与试机流程。',
        indexStatus: 'not_indexed',
        createdAt: now,
        updatedAt: now,
      },
    );
  },
});

export default seed;
