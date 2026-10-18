import { defineSeed } from '@nocobase/db';

/**
 * The two fictional devices the ledger starts with. A repeat run is a no-op: the unique `code` identifies each row,
 * and `update` only repeats the code, so a device the user has since renamed or edited keeps their changes.
 */
export default defineSeed({
  name: '202610070002_seed_devices',

  async run(context) {
    const devices = context.repository('devices');
    const seededAt = new Date('2026-01-05T09:00:00.000Z');

    await devices.upsertOne({
      filter: { code: 'EQ-001' },
      create: {
        code: 'EQ-001',
        name: '会议室投影仪',
        status: 'available',
        notes: '存放于三楼行政办公室',
        createdAt: seededAt,
        updatedAt: null,
      },
      update: { code: 'EQ-001' },
    });

    await devices.upsertOne({
      filter: { code: 'EQ-002' },
      create: {
        code: 'EQ-002',
        name: '便携扩音器',
        status: 'borrowed',
        notes: '上周借给市场部',
        createdAt: seededAt,
        updatedAt: null,
      },
      update: { code: 'EQ-002' },
    });
  },
});
