import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

/**
 * Installs the two devices the device ledger starts with. This is required data, not sample data, so the team sees a
 * usable list on a fresh install without turning on `APP_SAMPLE_DATA`.
 *
 * The seed is idempotent: it keys on the unique business value `reference` with `upsertOne`, so a second run corrects
 * the two devices instead of duplicating them. `id` is generated only in `create`, so re-running keeps the ids records
 * already reference.
 */
const devices = [
  {
    reference: 'DEV-0001',
    name: '便携投影仪 / Portable projector',
    status: 'available',
    remark: '存放在三楼会议室 / Stored in the third-floor meeting room.',
  },
  {
    reference: 'DEV-0002',
    name: '降噪耳机 / Noise-cancelling headphones',
    status: 'borrowed',
    remark: '借给市场部 / Lent to the marketing team.',
  },
] as const;

export default defineSeed({
  name: '202610120002_seed_devices',

  async run(context) {
    const devicesRepository = context.repository('devices');
    const now = new Date();

    for (const device of devices) {
      await devicesRepository.upsertOne({
        filter: { reference: device.reference },
        create: {
          id: randomUUID(),
          reference: device.reference,
          name: device.name,
          status: device.status,
          remark: device.remark,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          name: device.name,
          status: device.status,
          remark: device.remark,
          updatedAt: now,
        },
      });
    }
  },
});
