import { defineSeed, type SeedDefinition } from '@nocobase/db';

const FIXED = new Date('2026-09-10T08:00:00.000Z');

interface VenueSeed {
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  readonly unitPrice: number;
  readonly status: string;
  readonly description: string;
}

interface TenantSeed {
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly contactEmail: string;
  readonly note: string;
}

interface BookingSeed {
  readonly reference: string;
  readonly venue: string;
  readonly tenant: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly fee: number;
  readonly status: string;
  readonly note?: string;
  readonly deliveryCondition?: string;
  readonly deliveredAt?: string;
  readonly returnCondition?: string;
  readonly returnedAt?: string;
  readonly damageNote?: string;
  readonly damageFee?: number;
  readonly confirmedAt?: string;
  readonly settledAt?: string;
  readonly cancelReason?: string;
  readonly cancelledAt?: string;
}

const VENUES: readonly VenueSeed[] = [
  {
    name: '云杉厅',
    location: 'A 座 3 层 301',
    capacity: 12,
    unitPrice: 380,
    status: 'available',
    description: '小型会议室，配 65 寸显示屏与视频会议终端。',
  },
  {
    name: '银杏厅',
    location: 'A 座 5 层 502',
    capacity: 30,
    unitPrice: 880,
    status: 'available',
    description: '中型会议室，可平铺或分组摆放。',
  },
  {
    name: '海桐多功能厅',
    location: 'B 座 1 层 101',
    capacity: 80,
    unitPrice: 1600,
    status: 'available',
    description: '可举办发布会与论坛，含舞台与音响。',
  },
  {
    name: '枫林培训室',
    location: 'B 座 2 层 205',
    capacity: 24,
    unitPrice: 520,
    status: 'available',
    description: '培训教室，桌椅可移动，配白板。',
  },
  {
    name: '星河报告厅',
    location: 'C 座顶层',
    capacity: 200,
    unitPrice: 3200,
    status: 'maintenance',
    description: '大型报告厅，舞台灯光检修中，暂停预订。',
  },
  {
    name: '白桦洽谈室',
    location: 'C 座 2 层 208',
    capacity: 8,
    unitPrice: 260,
    status: 'inactive',
    description: '小型洽谈室，已停用。',
  },
];

const TENANTS: readonly TenantSeed[] = [
  {
    name: '星辰科技有限公司',
    contactName: '张伟',
    contactPhone: '138-0000-0001',
    contactEmail: 'zhangwei@xingchen.example',
    note: '长期客户，偏好云杉厅。',
  },
  {
    name: '蓝湾文化传播',
    contactName: '李娜',
    contactPhone: '138-0000-0002',
    contactEmail: 'lina@lanwan.example',
    note: '拍摄类活动较多。',
  },
  {
    name: '远航教育集团',
    contactName: '王强',
    contactPhone: '138-0000-0003',
    contactEmail: 'wangqiang@yuanhang.example',
    note: '培训需求集中在工作日。',
  },
  {
    name: '拾光影像工作室',
    contactName: '陈静',
    contactPhone: '138-0000-0004',
    contactEmail: 'chenjing@shiguang.example',
    note: '需要安静的洽谈环境。',
  },
  {
    name: '恒丰咨询',
    contactName: '刘洋',
    contactPhone: '138-0000-0005',
    contactEmail: 'liuyang@hengfeng.example',
    note: '经常预订整日场地。',
  },
  {
    name: '绿洲公益基金会',
    contactName: '赵敏',
    contactPhone: '138-0000-0006',
    contactEmail: 'zhaomin@lvzhou.example',
    note: '公益论坛，费用按公益价结算。',
  },
  {
    name: '麦田产品设计',
    contactName: '孙磊',
    contactPhone: '138-0000-0007',
    contactEmail: 'sunlei@maitian.example',
    note: '设计评审偏好枫林培训室。',
  },
  {
    name: '木棉餐饮管理',
    contactName: '周芳',
    contactPhone: '138-0000-0008',
    contactEmail: 'zhoufang@mumian.example',
    note: '供应商大会需要大面积场地。',
  },
];

const BOOKINGS: readonly BookingSeed[] = [
  {
    reference: 'BK-2026-0001',
    venue: '云杉厅',
    tenant: '星辰科技有限公司',
    title: '产品发布会',
    startAt: '2026-09-22T09:00:00.000Z',
    endAt: '2026-09-22T12:00:00.000Z',
    fee: 1140,
    status: 'confirmed',
    confirmedAt: '2026-09-15T02:00:00.000Z',
    note: '需提前 30 分钟入场布置。',
  },
  {
    reference: 'BK-2026-0002',
    venue: '银杏厅',
    tenant: '蓝湾文化传播',
    title: '品牌拍摄',
    startAt: '2026-09-23T13:00:00.000Z',
    endAt: '2026-09-23T18:00:00.000Z',
    fee: 4400,
    status: 'delivered',
    confirmedAt: '2026-09-16T01:00:00.000Z',
    deliveryCondition: '场地整洁，投影与音响正常，桌椅 30 套。',
    deliveredAt: '2026-09-23T12:40:00.000Z',
  },
  {
    reference: 'BK-2026-0003',
    venue: '海桐多功能厅',
    tenant: '远航教育集团',
    title: '教师培训',
    startAt: '2026-09-24T09:00:00.000Z',
    endAt: '2026-09-24T17:00:00.000Z',
    fee: 12800,
    status: 'returned',
    confirmedAt: '2026-09-16T01:30:00.000Z',
    deliveryCondition: '舞台音响调试完成，签到处布置完毕。',
    deliveredAt: '2026-09-24T08:30:00.000Z',
    returnCondition: '桌椅归位，地面有少量污渍需清洁。',
    returnedAt: '2026-09-24T17:20:00.000Z',
    damageNote: '投影幕布有折痕',
    damageFee: 120,
  },
  {
    reference: 'BK-2026-0004',
    venue: '枫林培训室',
    tenant: '拾光影像工作室',
    title: '客户沟通会',
    startAt: '2026-09-25T10:00:00.000Z',
    endAt: '2026-09-25T11:30:00.000Z',
    fee: 780,
    status: 'pending',
    note: '等待经理确认。',
  },
  {
    reference: 'BK-2026-0005',
    venue: '海桐多功能厅',
    tenant: '恒丰咨询',
    title: '年度战略会',
    startAt: '2026-09-26T09:00:00.000Z',
    endAt: '2026-09-26T18:00:00.000Z',
    fee: 14400,
    status: 'pending',
  },
  {
    reference: 'BK-2026-0006',
    venue: '海桐多功能厅',
    tenant: '绿洲公益基金会',
    title: '公益论坛',
    startAt: '2026-09-28T14:00:00.000Z',
    endAt: '2026-09-28T17:00:00.000Z',
    fee: 4800,
    status: 'confirmed',
    confirmedAt: '2026-09-18T02:00:00.000Z',
    note: '需预留嘉宾休息区。',
  },
  {
    reference: 'BK-2026-0007',
    venue: '枫林培训室',
    tenant: '麦田产品设计',
    title: '设计评审',
    startAt: '2026-09-29T09:30:00.000Z',
    endAt: '2026-09-29T12:00:00.000Z',
    fee: 1300,
    status: 'delivered',
    confirmedAt: '2026-09-17T03:00:00.000Z',
    deliveryCondition: '桌椅 24 套，白板笔齐备。',
    deliveredAt: '2026-09-29T09:10:00.000Z',
  },
  {
    reference: 'BK-2026-0008',
    venue: '银杏厅',
    tenant: '木棉餐饮管理',
    title: '供应商大会',
    startAt: '2026-10-02T09:00:00.000Z',
    endAt: '2026-10-02T16:00:00.000Z',
    fee: 6160,
    status: 'settled',
    confirmedAt: '2026-09-20T02:00:00.000Z',
    deliveryCondition: '茶歇区布置完成。',
    deliveredAt: '2026-10-02T08:45:00.000Z',
    returnCondition: '场地恢复良好，无损坏。',
    returnedAt: '2026-10-02T16:15:00.000Z',
    damageFee: 0,
    settledAt: '2026-10-02T16:30:00.000Z',
  },
  {
    reference: 'BK-2026-0009',
    venue: '云杉厅',
    tenant: '星辰科技有限公司',
    title: '技术分享',
    startAt: '2026-10-03T14:00:00.000Z',
    endAt: '2026-10-03T17:00:00.000Z',
    fee: 1140,
    status: 'pending',
  },
  {
    reference: 'BK-2026-0010',
    venue: '海桐多功能厅',
    tenant: '蓝湾文化传播',
    title: '客户答谢会',
    startAt: '2026-10-05T18:00:00.000Z',
    endAt: '2026-10-05T21:00:00.000Z',
    fee: 4800,
    status: 'cancelled',
    cancelReason: '客户临时调整档期',
    cancelledAt: '2026-09-30T03:00:00.000Z',
  },
  {
    reference: 'BK-2026-0011',
    venue: '银杏厅',
    tenant: '远航教育集团',
    title: '招生说明会',
    startAt: '2026-10-06T09:00:00.000Z',
    endAt: '2026-10-06T12:00:00.000Z',
    fee: 2640,
    status: 'confirmed',
    confirmedAt: '2026-09-25T01:00:00.000Z',
  },
  {
    reference: 'BK-2026-0012',
    venue: '枫林培训室',
    tenant: '恒丰咨询',
    title: '项目复盘',
    startAt: '2026-10-08T13:00:00.000Z',
    endAt: '2026-10-08T15:30:00.000Z',
    fee: 1300,
    status: 'returned',
    confirmedAt: '2026-09-26T02:00:00.000Z',
    deliveryCondition: '场地整洁，白板可用。',
    deliveredAt: '2026-10-08T12:45:00.000Z',
    returnCondition: '场地恢复良好，无损坏。',
    returnedAt: '2026-10-08T15:45:00.000Z',
    damageFee: 0,
  },
];

/**
 * Fixed demo data: 6 venues, 8 tenants and 12 bookings covering every status.
 * Bookings belong to the built-in `nocobase` administrator, so manager views
 * have content while a newly registered staff account starts with an empty
 * list until a booking is assigned to them.
 *
 * Every insert is guarded by the unique business key, so a repeat run adds
 * nothing. No current timestamps or random values are used.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609190011_seed_rental_demo_data',

  async run({ query }) {
    const venueIds = new Map<string, number>();
    for (const venue of VENUES) {
      const existing = await query
        .selectFrom('rentalVenues')
        .select('id')
        .where('name', '=', venue.name)
        .executeTakeFirst();
      if (existing) {
        venueIds.set(venue.name, Number(existing.id));
        continue;
      }
      const result = await query
        .insertInto('rentalVenues')
        .values({ ...venue, createdAt: FIXED, updatedAt: FIXED })
        .execute();
      venueIds.set(venue.name, Number(result.insertId));
    }

    const tenantIds = new Map<string, number>();
    for (const tenant of TENANTS) {
      const existing = await query
        .selectFrom('rentalTenants')
        .select('id')
        .where('name', '=', tenant.name)
        .executeTakeFirst();
      if (existing) {
        tenantIds.set(tenant.name, Number(existing.id));
        continue;
      }
      const result = await query
        .insertInto('rentalTenants')
        .values({ ...tenant, createdAt: FIXED, updatedAt: FIXED })
        .execute();
      tenantIds.set(tenant.name, Number(result.insertId));
    }

    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const ownerId = admin ? String(admin.id) : '';

    for (const booking of BOOKINGS) {
      const venueId = venueIds.get(booking.venue);
      const tenantId = tenantIds.get(booking.tenant);
      if (!venueId || !tenantId) continue;

      const existing = await query
        .selectFrom('rentalBookings')
        .select('id')
        .where('reference', '=', booking.reference)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('rentalBookings')
        .values({
          reference: booking.reference,
          venueId,
          tenantId,
          ownerId,
          title: booking.title,
          startAt: new Date(booking.startAt),
          endAt: new Date(booking.endAt),
          fee: booking.fee,
          status: booking.status,
          note: booking.note ?? null,
          deliveryCondition: booking.deliveryCondition ?? null,
          deliveredAt: booking.deliveredAt
            ? new Date(booking.deliveredAt)
            : null,
          returnCondition: booking.returnCondition ?? null,
          returnedAt: booking.returnedAt ? new Date(booking.returnedAt) : null,
          damageNote: booking.damageNote ?? null,
          damageFee: booking.damageFee ?? null,
          confirmedAt: booking.confirmedAt
            ? new Date(booking.confirmedAt)
            : null,
          settledAt: booking.settledAt ? new Date(booking.settledAt) : null,
          cancelReason: booking.cancelReason ?? null,
          cancelledAt: booking.cancelledAt
            ? new Date(booking.cancelledAt)
            : null,
          createdAt: FIXED,
          updatedAt: FIXED,
        })
        .execute();
    }
  },
});

export default seed;
