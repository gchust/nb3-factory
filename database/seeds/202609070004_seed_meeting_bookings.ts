import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Fictional bookings spread across the day the seed runs and the following days, covering both booked and cancelled
 * statuses so the pages have content to operate on. The seed is idempotent: it only inserts when the table is empty.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609070004_seed_meeting_bookings',

  async run({ query }) {
    const existing = await query
      .selectFrom('meetingBookings')
      .select('id')
      .limit(1)
      .executeTakeFirst();

    if (existing) {
      return;
    }

    const rooms = await query
      .selectFrom('meetingRooms')
      .select(['id', 'code'])
      .execute();

    const roomId = (code: string): number => {
      const room = rooms.find((candidate) => candidate.code === code);
      if (!room) {
        throw new Error(`Seed meeting room "${code}" is missing.`);
      }
      return Number(room.id);
    };

    // Day offset 0 is the day the seed runs; times are local wall-clock times.
    const at = (dayOffset: number, hour: number, minute = 0): Date => {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(hour, minute, 0, 0);
      return date;
    };

    const now = new Date();
    await query
      .insertInto('meetingBookings')
      .values([
        {
          title: '产品周会',
          roomId: roomId('R-201'),
          organizer: '张伟',
          startTime: at(0, 9, 0),
          endTime: at(0, 10, 0),
          notes: '同步本周产品进展与排期。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '技术方案评审',
          roomId: roomId('R-201'),
          organizer: '李娜',
          startTime: at(0, 10, 0),
          endTime: at(0, 11, 0),
          notes: '评审新架构方案，首尾相接的时段。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '客户需求沟通',
          roomId: roomId('R-102'),
          organizer: '王强',
          startTime: at(0, 14, 0),
          endTime: at(0, 15, 30),
          notes: '与客户确认需求细节。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '部门例会',
          roomId: roomId('R-301'),
          organizer: '赵敏',
          startTime: at(0, 16, 0),
          endTime: at(0, 17, 0),
          notes: '已取消的示例预约。',
          status: 'cancelled',
          createdAt: now,
        },
        {
          title: '新人入职培训',
          roomId: roomId('R-102'),
          organizer: '人力资源部',
          startTime: at(1, 9, 30),
          endTime: at(1, 11, 0),
          notes: '新员工入职流程介绍。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '项目启动会',
          roomId: roomId('R-201'),
          organizer: '陈杰',
          startTime: at(1, 13, 0),
          endTime: at(1, 14, 0),
          notes: '新项目立项与分工。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '季度经营分析',
          roomId: roomId('R-301'),
          organizer: '刘洋',
          startTime: at(1, 15, 0),
          endTime: at(1, 16, 30),
          notes: '已取消的示例预约。',
          status: 'cancelled',
          createdAt: now,
        },
        {
          title: '设计评审会',
          roomId: roomId('R-101'),
          organizer: '孙丽',
          startTime: at(2, 10, 0),
          endTime: at(2, 11, 30),
          notes: '新版界面设计稿评审。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '安全演练总结',
          roomId: roomId('R-102'),
          organizer: '信息安全组',
          startTime: at(2, 15, 0),
          endTime: at(2, 16, 0),
          notes: '安全演练复盘与改进项。',
          status: 'booked',
          createdAt: now,
        },
        {
          title: '年度规划讨论',
          roomId: roomId('R-301'),
          organizer: '管理层',
          startTime: at(3, 9, 0),
          endTime: at(3, 11, 0),
          notes: '讨论下一年度业务规划。',
          status: 'booked',
          createdAt: now,
        },
      ])
      .execute();
  },
});

export default seed;
