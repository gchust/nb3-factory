import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

/**
 * The two fictional devices the ledger starts with. They are install data, not sample data: the ledger is expected to
 * be usable immediately after installation, including when the database is created without `APP_SAMPLE_DATA`.
 *
 * The seed checks the business key before inserting, so a repeated run is a no-op and never overwrites a code or name
 * an administrator has edited.
 */
export default defineSeed({
  name: '202610200002_seed_devices',

  run: async (context) => {
    const devices = context.repository('devices');
    const rows = [
      {
        code: 'DEV-0001',
        name: '会议室投影仪',
        status: 'available',
      },
      {
        code: 'DEV-0002',
        name: '便携式录音笔',
        status: 'borrowed',
      },
    ] as const;

    for (const row of rows) {
      const exists = await devices.exists({ filter: { code: row.code } });
      if (exists) continue;

      const now = new Date();
      await devices.createOne({
        values: {
          id: randomUUID(),
          code: row.code,
          name: row.name,
          status: row.status,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});
