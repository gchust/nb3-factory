import { defineSeed } from '@nocobase/db';

import { asText } from '../../../server/service/text.ts';

import { SERVICE_MANUALS } from '../../seed-data/service-manuals.ts';

interface SeedRepository {
  findOne(options: { filter: object }): Promise<unknown>;
  createOne(options: { values: object }): Promise<{ record: unknown }>;
}

const upsert = async (
  source: unknown,
  filter: object,
  values: object,
): Promise<Record<string, unknown>> => {
  const repo = source as SeedRepository;
  const existing = (await repo.findOne({ filter })) as
    Record<string, unknown> | undefined;
  if (existing) {
    return existing;
  }
  const created = await repo.createOne({ values: withTimestamps(values) });
  return created.record as Record<string, unknown>;
};

interface NumberFieldFilter {
  eq(value: unknown): object;
}

interface DateFieldFilter {
  on(value: unknown): object;
}

interface InspectionFilterBuilder {
  and(items: object[]): object;
  number(path: string): NumberFieldFilter;
  date(path: string): DateFieldFilter;
}

const withTimestamps = (values: object): Record<string, unknown> => {
  const now = new Date();
  return { createdAt: now, updatedAt: now, ...values };
};

/**
 * Demonstration data for the after-sales service system: customers, devices,
 * work orders covering every lifecycle state, an inspection, published repair
 * knowledge and the equipment manuals. Every row is matched on a natural key
 * first, so saving and re-running changes nothing and never duplicates.
 */
export default defineSeed({
  name: '202609260003_service_business_data',
  transaction: true,
  async run(context) {
    const users = context.repository('user');
    const customers = context.repository('serviceCustomers');
    const devices = context.repository('serviceDevices');
    const orders = context.repository('serviceWorkOrders');
    const inspections = context.repository('serviceInspections');
    const knowledge = context.repository('serviceKnowledgeArticles');
    const manuals = context.repository('serviceManuals');

    const userId = async (email: string): Promise<string | undefined> => {
      const user = await users.findOne({ filter: { email } });
      return user ? asText(user.id) : undefined;
    };

    const supervisorId = await userId('supervisor@service.local');
    const engineerAId = await userId('engineer.a@service.local');
    const engineerBId = await userId('engineer.b@service.local');

    // ------------------------------------------------------------ customers
    const customerSeeds = [
      {
        name: '华东精密制造有限公司',
        contactName: '刘敏',
        contactPhone: '13800000001',
        contactEmail: 'liumin@huadong.example',
        address: '江苏省苏州市工业园区星湖街 88 号',
        note: '重点客户，响应时限 4 小时。',
      },
      {
        name: '华南食品机械集团',
        contactName: '黄强',
        contactPhone: '13800000002',
        contactEmail: 'huangqiang@huanan.example',
        address: '广东省佛山市南海区科技路 12 号',
        note: '生产环境连续运行，停机影响大。',
      },
      {
        name: '西南能源装备有限公司',
        contactName: '赵磊',
        contactPhone: '13800000003',
        contactEmail: 'zhaolei@xinan.example',
        address: '四川省成都市高新区天府大道 500 号',
        note: '偏远站点，需提前预约上门。',
      },
    ];
    const customerIds: number[] = [];
    for (const seed of customerSeeds) {
      const row = await upsert(customers, { name: seed.name }, seed);
      customerIds.push(Number(row.id));
    }

    // -------------------------------------------------------------- devices
    const deviceSeeds = [
      {
        serialNumber: 'NX200-A-0001',
        name: '1 号注水泵',
        model: 'NX-200',
        customerId: customerIds[0],
        engineerId: engineerAId,
        enabled: true,
        installedAt: '2024-03-15',
        nextInspectionDate: '2026-10-05',
        location: '苏州一厂泵房',
      },
      {
        serialNumber: 'NX200-A-0002',
        name: '2 号循环泵',
        model: 'NX-200',
        customerId: customerIds[0],
        engineerId: engineerAId,
        enabled: true,
        installedAt: '2024-04-02',
        nextInspectionDate: '2026-09-20',
        location: '苏州一厂二号车间',
      },
      {
        serialNumber: 'HX150-B-0101',
        name: '食品线输送泵',
        model: 'HX-150',
        customerId: customerIds[1],
        engineerId: engineerBId,
        enabled: true,
        installedAt: '2023-11-10',
        nextInspectionDate: '2026-10-01',
        location: '佛山南海生产线',
      },
      {
        serialNumber: 'HX150-B-0102',
        name: '清洗工位泵',
        model: 'HX-150',
        customerId: customerIds[1],
        engineerId: engineerBId,
        enabled: true,
        installedAt: '2024-01-20',
        nextInspectionDate: '2026-09-15',
        location: '佛山清洗车间',
      },
      {
        serialNumber: 'GY300-C-0201',
        name: '高压供水泵',
        model: 'GY-300',
        customerId: customerIds[2],
        engineerId: engineerAId,
        enabled: true,
        installedAt: '2022-08-08',
        nextInspectionDate: '2026-10-12',
        location: '成都高新泵站',
      },
      {
        serialNumber: 'GY300-C-0202',
        name: '备用供水泵',
        model: 'GY-300',
        customerId: customerIds[2],
        engineerId: engineerBId,
        enabled: false,
        installedAt: '2022-08-08',
        nextInspectionDate: '2026-11-01',
        location: '成都高新泵站',
        note: '长期停机备用。',
      },
    ];
    const deviceIds: number[] = [];
    for (const seed of deviceSeeds) {
      const row = await upsert(
        devices,
        { serialNumber: seed.serialNumber },
        seed,
      );
      deviceIds.push(Number(row.id));
    }

    // ----------------------------------------------------------- work orders
    const now = Date.now();
    const days = (offset: number): Date =>
      new Date(now + offset * 24 * 60 * 60 * 1000);
    const orderSeeds = [
      {
        orderNo: 'WO-2026-0001',
        title: '1 号注水泵出口压力偏低',
        description: '客户反馈出口压力长期低于 0.4 MPa，需要上门检查滤芯。',
        customerId: customerIds[0],
        deviceId: deviceIds[0],
        priority: 'normal',
        status: 'pending_accept',
        source: 'manual',
        confidential: false,
        assigneeId: engineerAId,
        createdById: supervisorId,
        dueAt: days(3),
      },
      {
        orderNo: 'WO-2026-0002',
        title: '2 号循环泵轴承异响（加急）',
        description: '运行中出现明显异响，客户要求当天响应。',
        customerId: customerIds[0],
        deviceId: deviceIds[1],
        priority: 'urgent',
        status: 'pending_process',
        source: 'manual',
        confidential: false,
        assigneeId: engineerAId,
        acceptedById: engineerAId,
        acceptedAt: days(-1),
        createdById: supervisorId,
        dueAt: days(1),
      },
      {
        orderNo: 'WO-2026-0003',
        title: '食品线输送泵密封滴漏',
        description: '密封处滴漏约 10 滴/分钟，已现场处理中。',
        customerId: customerIds[1],
        deviceId: deviceIds[2],
        priority: 'normal',
        status: 'processing',
        source: 'manual',
        confidential: false,
        assigneeId: engineerBId,
        acceptedById: engineerBId,
        acceptedAt: days(-2),
        startedAt: days(-1),
        createdById: supervisorId,
        dueAt: days(2),
      },
      {
        orderNo: 'WO-2026-0004',
        title: '清洗工位泵保养完成待确认',
        description: '完成一级保养并更换滤芯，等待主管确认。',
        customerId: customerIds[1],
        deviceId: deviceIds[3],
        priority: 'normal',
        status: 'pending_confirm',
        source: 'manual',
        confidential: false,
        assigneeId: engineerBId,
        acceptedById: engineerBId,
        acceptedAt: days(-4),
        startedAt: days(-3),
        submittedAt: days(-1),
        resolution: '更换滤芯与润滑脂，试运行正常。',
        createdById: supervisorId,
        dueAt: days(1),
      },
      {
        orderNo: 'WO-2026-0005',
        title: '高压供水泵电气检查（涉密）',
        description: '涉及客户工艺参数，仅限指定工程师查阅。',
        customerId: customerIds[2],
        deviceId: deviceIds[4],
        priority: 'normal',
        status: 'processing',
        source: 'manual',
        confidential: true,
        assigneeId: engineerAId,
        acceptedById: engineerAId,
        acceptedAt: days(-1),
        startedAt: days(-1),
        createdById: supervisorId,
        dueAt: days(4),
      },
      {
        orderNo: 'WO-2026-0006',
        title: '备用供水泵出场检修（已超期）',
        description: '设备长期停机，需确认拆检方案，已超过约定时间。',
        customerId: customerIds[2],
        deviceId: deviceIds[5],
        priority: 'normal',
        status: 'pending_process',
        source: 'manual',
        confidential: false,
        assigneeId: engineerBId,
        acceptedById: engineerBId,
        acceptedAt: days(-6),
        createdById: supervisorId,
        dueAt: days(-2),
      },
    ];
    const orderIds: number[] = [];
    for (const seed of orderSeeds) {
      const row = await upsert(orders, { orderNo: seed.orderNo }, seed);
      orderIds.push(Number(row.id));
    }

    // ----------------------------------------------------------- inspections
    await upsert(
      inspections,
      (filter: InspectionFilterBuilder) =>
        filter.and([
          filter.number('deviceId').eq(deviceIds[0]),
          filter.date('plannedDate').on('2026-10-05'),
        ]),
      {
        deviceId: deviceIds[0],
        plannedDate: '2026-10-05',
        assigneeId: engineerAId,
        status: 'pending',
      },
    );

    // ------------------------------------------------------------- knowledge
    const knowledgeSeeds = [
      {
        title: 'NX-200 出口压力偏低的排查步骤',
        summary: '从滤芯、叶轮到压力表的顺序排查压力偏低。',
        content: [
          '1. 读取出口压力表，确认是否低于 0.4 MPa。',
          '2. 检查入口过滤器压差，超过 0.1 MPa 时清洗滤芯。',
          '3. 检查叶轮磨损与汽蚀痕迹。',
          '4. 复核压力表校准有效期。',
          '5. 处理后连续观察 30 分钟并记录。',
        ].join('\n'),
        status: 'published',
        tags: '压力,滤芯,NX-200',
        authorId: supervisorId,
        publishedAt: days(-10),
      },
      {
        title: '机械密封滴漏的标准处置',
        summary: '按滴漏速率判断是否更换密封组件。',
        content: [
          '1. 滴漏 ≤ 5 滴/分钟视为正常，记录即可。',
          '2. 大于 5 滴/分钟先检查密封面是否夹有杂质。',
          '3. 冲洗无效时更换机械密封组件。',
          '4. 更换后空载运行 10 分钟确认无渗漏。',
        ].join('\n'),
        status: 'published',
        tags: '密封,滴漏,处置',
        authorId: supervisorId,
        publishedAt: days(-5),
      },
    ];
    for (const seed of knowledgeSeeds) {
      await upsert(knowledge, { title: seed.title }, seed);
    }

    // --------------------------------------------------------------- manuals
    for (const manual of SERVICE_MANUALS) {
      await upsert(
        manuals,
        { title: manual.title, version: manual.version },
        manual,
      );
    }

    void orderIds;
  },
});
