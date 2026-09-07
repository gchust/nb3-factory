import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Four fictional meeting rooms with different capacities. The seed is idempotent: it only inserts when the table is
 * empty, so a repeat run (or a run against a database that already has user data) never duplicates or overwrites.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609070003_seed_meeting_rooms',

  async run({ query }) {
    const existing = await query
      .selectFrom('meetingRooms')
      .select('id')
      .limit(1)
      .executeTakeFirst();

    if (existing) {
      return;
    }

    const now = new Date();
    await query
      .insertInto('meetingRooms')
      .values([
        {
          code: 'R-101',
          name: '会议室A',
          location: '一楼东侧',
          capacity: 8,
          equipment: '投影仪、白板、视频会议终端',
          available: true,
          createdAt: now,
        },
        {
          code: 'R-102',
          name: '会议室B',
          location: '一楼西侧',
          capacity: 12,
          equipment: '投影仪、白板、视频会议终端、电话会议设备',
          available: true,
          createdAt: now,
        },
        {
          code: 'R-201',
          name: '会议室C',
          location: '二楼东侧',
          capacity: 20,
          equipment: '投影仪、白板、视频会议终端、音响',
          available: true,
          createdAt: now,
        },
        {
          code: 'R-301',
          name: '报告厅',
          location: '三楼',
          capacity: 50,
          equipment: '投影仪、音响、视频会议终端、直播设备',
          available: true,
          createdAt: now,
        },
      ])
      .execute();
  },
});

export default seed;
