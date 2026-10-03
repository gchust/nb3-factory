import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * Fixed demonstration data for a fresh installation. It is reproducible: every
 * timestamp is a literal, every record is looked up by a stable business key
 * before insertion, and no user id is written — the provisioning provider
 * binds engineer profiles and order assignees to application users on boot.
 *
 * User-edited rows are never overwritten: an existing row short-circuits its
 * creation.
 */

const BASE = new Date('2026-09-01T00:00:00.000Z');

type AnyRecord = Record<string, unknown>;

async function findOrCreate(
  context: SeedContext,
  collection: string,
  keys: ReadonlyArray<readonly [string, unknown]>,
  values: AnyRecord,
): Promise<AnyRecord> {
  let select = context.query.selectFrom(collection).select('id');
  for (const [column, value] of keys) {
    select = select.where(column, '=', value as never);
  }
  const existing = await select.executeTakeFirst();
  if (existing) {
    return existing;
  }
  const now = new Date();
  const { record } = await context.repository<AnyRecord>(collection).createOne({
    values: { createdAt: now, updatedAt: now, ...values },
  });
  return record;
}

export default defineSeed({
  name: '202609010011_service_sample_data',
  transaction: true,
  async run(context) {
    const groupA = await findOrCreate(
      context,
      'engineerGroups',
      [['code', 'GROUP_JIA']],
      {
        code: 'GROUP_JIA',
        name: '甲组 / Group A',
        description: '一级响应工程师组',
      },
    );
    const groupB = await findOrCreate(
      context,
      'engineerGroups',
      [['code', 'GROUP_YI']],
      {
        code: 'GROUP_YI',
        name: '乙组 / Group B',
        description: '二级支持工程师组',
      },
    );

    const profiles: Record<string, AnyRecord> = {};
    const profileSeed = [
      {
        username: 'sup01',
        displayName: '王主管 / Supervisor Wang',
        appRole: 'supervisor',
        groupId: null,
      },
      {
        username: 'eng01',
        displayName: '李工 / Engineer Li',
        appRole: 'engineer',
        groupId: groupA.id,
      },
      {
        username: 'eng02',
        displayName: '赵工 / Engineer Zhao',
        appRole: 'engineer',
        groupId: groupB.id,
      },
      {
        username: 'obs01',
        displayName: '陈观察员 / Observer Chen',
        appRole: 'observer',
        groupId: null,
      },
      {
        username: 'int01',
        displayName: '外部集成账号 / Integration account',
        appRole: 'integration',
        groupId: null,
      },
    ];
    for (const profile of profileSeed) {
      profiles[profile.username] = await findOrCreate(
        context,
        'engineerProfiles',
        [['username', profile.username]],
        { ...profile, enabled: true },
      );
    }

    const customerSeed = [
      {
        name: '华东精密制造有限公司',
        contactName: '刘经理',
        contactPhone: '021-6000-1001',
        address: '上海市浦东新区工业路 100 号',
        note: '',
      },
      {
        name: '北方物流集团',
        contactName: '孙主管',
        contactPhone: '010-5000-2002',
        address: '北京市大兴区物流园区 8 号',
        note: '',
      },
      {
        name: '南方电子科技',
        contactName: '周工',
        contactPhone: '0755-4000-3003',
        address: '深圳市南山区科技园 18 号',
        note: '',
      },
    ];
    const customers: AnyRecord[] = [];
    for (const customer of customerSeed) {
      customers.push(
        await findOrCreate(
          context,
          'customers',
          [['name', customer.name]],
          customer,
        ),
      );
    }

    const deviceSeed: Array<{
      deviceNo: string;
      name: string;
      customer: number;
      engineer: string;
      status: string;
      nextInspectionDate: string | null;
      model: string;
      location: string;
    }> = [
      {
        deviceNo: 'D-1001',
        name: '注塑机 A1',
        customer: 0,
        engineer: 'eng01',
        status: 'active',
        nextInspectionDate: '2026-09-15',
        model: 'IM-220',
        location: '华东一号车间',
      },
      {
        deviceNo: 'D-1002',
        name: '数控机床 B2',
        customer: 0,
        engineer: 'eng01',
        status: 'active',
        nextInspectionDate: '2026-09-20',
        model: 'CNC-880',
        location: '华东二号车间',
      },
      {
        deviceNo: 'D-2001',
        name: '分拣线 C1',
        customer: 1,
        engineer: 'eng02',
        status: 'active',
        nextInspectionDate: '2026-09-10',
        model: 'SORT-500',
        location: '北方分拣中心',
      },
      {
        deviceNo: 'D-2002',
        name: '包装机 C2',
        customer: 1,
        engineer: 'eng02',
        status: 'maintenance',
        nextInspectionDate: '2026-10-01',
        model: 'PACK-300',
        location: '北方包装车间',
      },
      {
        deviceNo: 'D-3001',
        name: 'SMT 贴片机 D1',
        customer: 2,
        engineer: 'eng01',
        status: 'active',
        nextInspectionDate: '2026-09-25',
        model: 'SMT-900',
        location: '南方电子一厂',
      },
      {
        deviceNo: 'D-3002',
        name: '综合测试仪 D2',
        customer: 2,
        engineer: 'eng02',
        status: 'disabled',
        nextInspectionDate: null,
        model: 'TEST-100',
        location: '南方电子二厂',
      },
    ];

    const devices: Record<string, AnyRecord> = {};
    for (const device of deviceSeed) {
      devices[device.deviceNo] = await findOrCreate(
        context,
        'devices',
        [['deviceNo', device.deviceNo]],
        {
          deviceNo: device.deviceNo,
          name: device.name,
          customerId: customers[device.customer].id,
          engineerProfileId: profiles[device.engineer].id,
          serviceEngineerId: null,
          status: device.status,
          nextInspectionDate: device.nextInspectionDate,
          model: device.model,
          location: device.location,
        },
      );
    }

    const articleSeed: Array<{ title: string; status: string; body: string }> =
      [
        {
          title: '常见故障：注塑机液压不足',
          body: '检查液压油位、滤芯与溢流阀设定值。若压力仍低于 80% 额定值，更换液压泵并复测。',
          status: 'published',
        },
        {
          title: '数控机床日常保养清单',
          body: '每日清理导轨切屑；每周检查润滑油脂；每月校准主轴跳动并记录。',
          status: 'published',
        },
        {
          title: '内部：设备停机分级处理流程',
          body: '一级停机 30 分钟内到场，二级停机 4 小时内响应，三级停机按计划处理。',
          status: 'draft',
        },
      ];
    for (const article of articleSeed) {
      await findOrCreate(
        context,
        'knowledgeArticles',
        [['title', article.title]],
        article,
      );
    }

    const orderSeed: Array<{
      orderNo: string;
      title: string;
      customer: number;
      device: string;
      engineer: string | null;
      priority: string;
      status: string;
      confidential: boolean;
      problem: string;
      deadline?: Date;
      acceptanceNote?: string;
      resolution?: string;
      startedAt?: Date;
      submittedAt?: Date;
      closedAt?: Date;
      acceptedAt?: Date;
    }> = [
      {
        orderNo: 'WO-2026-0001',
        title: '注塑机压力异常',
        customer: 0,
        device: 'D-1001',
        engineer: 'eng01',
        priority: 'urgent',
        status: 'pending_accept',
        confidential: false,
        problem: '客户反馈注塑机压力不稳，产品出现缺料。',
        deadline: new Date('2026-09-20T09:00:00.000Z'),
      },
      {
        orderNo: 'WO-2026-0002',
        title: '分拣线传感器误报',
        customer: 1,
        device: 'D-2001',
        engineer: 'eng02',
        priority: 'normal',
        status: 'pending_process',
        confidential: false,
        problem: '分拣线偶发误报，需现场检查光电传感器。',
        acceptedAt: BASE,
        acceptanceNote: '普通工单：按标准流程安排常规处理。',
      },
      {
        orderNo: 'WO-2026-0003',
        title: '贴片机抛料率偏高',
        customer: 2,
        device: 'D-3001',
        engineer: 'eng01',
        priority: 'normal',
        status: 'processing',
        confidential: false,
        problem: '贴片机抛料率超过 3%，需校正供料器与吸嘴。',
        deadline: new Date('2026-09-28T09:00:00.000Z'),
        acceptedAt: BASE,
        startedAt: BASE,
        acceptanceNote: '普通工单：按标准流程安排常规处理。',
      },
      {
        orderNo: 'WO-2026-0004',
        title: '数控机床主轴异响',
        customer: 0,
        device: 'D-1002',
        engineer: 'eng01',
        priority: 'urgent',
        status: 'pending_confirm',
        confidential: false,
        problem: '主轴高速运转时有异响，已停机待确认。',
        acceptedAt: BASE,
        startedAt: BASE,
        submittedAt: BASE,
        acceptanceNote: '紧急工单：2 小时内联系客户并优先派工。',
        resolution: '更换主轴轴承并重新动平衡，异响消除。',
      },
      {
        orderNo: 'WO-2026-0005',
        title: '包装机封口温度漂移',
        customer: 1,
        device: 'D-2002',
        engineer: 'eng02',
        priority: 'normal',
        status: 'closed',
        confidential: false,
        problem: '封口温度波动导致封口不牢。',
        acceptedAt: BASE,
        startedAt: BASE,
        submittedAt: BASE,
        closedAt: BASE,
        acceptanceNote: '普通工单：按标准流程安排常规处理。',
        resolution: '更换温控模块并标定，连续试产 200 件合格。',
      },
      {
        orderNo: 'WO-2026-0006',
        title: '测试仪主板故障（保密）',
        customer: 2,
        device: 'D-3002',
        engineer: 'eng02',
        priority: 'normal',
        status: 'pending_accept',
        confidential: true,
        problem: '客户保密项目，仅限负责人及主管查看处理细节。',
      },
    ];

    for (const order of orderSeed) {
      await findOrCreate(
        context,
        'serviceOrders',
        [['orderNo', order.orderNo]],
        {
          orderNo: order.orderNo,
          externalEventNo: null,
          title: order.title,
          customerId: customers[order.customer].id,
          deviceId: devices[order.device].id,
          problemDescription: order.problem,
          priority: order.priority,
          status: order.status,
          source: 'internal',
          confidential: order.confidential,
          deadline: order.deadline ?? null,
          assigneeId: null,
          assigneeProfileId: order.engineer
            ? profiles[order.engineer].id
            : null,
          groupId: order.engineer ? profiles[order.engineer].groupId : null,
          createdById: profiles.sup01.id,
          reporterId: profiles.sup01.id,
          acceptedAt: order.acceptedAt ?? null,
          startedAt: order.startedAt ?? null,
          submittedAt: order.submittedAt ?? null,
          closedAt: order.closedAt ?? null,
          acceptanceNote: order.acceptanceNote ?? null,
          resolution: order.resolution ?? null,
          returnReason: null,
          returnCount: 0,
          lastWorkflowRunId: null,
        },
      );
    }

    await findOrCreate(
      context,
      'inspections',
      [
        ['deviceId', devices['D-2001'].id],
        ['planDate', '2026-09-10'],
      ],
      {
        deviceId: devices['D-2001'].id,
        planDate: '2026-09-10',
        assigneeId: null,
        assigneeProfileId: profiles.eng02.id,
        status: 'pending',
        result: null,
        completedAt: null,
        createdById: profiles.sup01.id,
        idempotencyKey: 'seed-inspection-D-2001-20260910',
      },
    );
  },
});
