import { defineSeed } from '@nocobase/db';

interface DeviceSeedRow {
  readonly code: string;
  readonly name: string;
  readonly status: 'available' | 'borrowed';
  readonly notes: string;
}

/**
 * The two devices the ledger starts with: one of each status, so the list, the status filter and the borrowed badge
 * all show something after a fresh installation.
 *
 * Names and notes are business data, not translations: they stay exactly as written whichever language the interface
 * is showing. Everything around them — the field labels, the statuses, the buttons — is translated.
 */
const DEVICES: readonly DeviceSeedRow[] = [
  {
    code: 'DEV-001',
    name: '会议室投影仪',
    status: 'available',
    notes: '三层 A 会议室，含遥控器和 HDMI 线。',
  },
  {
    code: 'DEV-002',
    name: 'Field Measurement Tablet',
    status: 'borrowed',
    notes: 'With the field team since Monday; due back Friday.',
  },
];

/**
 * Required data rather than sample data: the application is not useful without a ledger to start from, so the seed is
 * not marked `sample` and runs on every install.
 *
 * It is idempotent by `code`: a replay creates only what is missing and leaves a device someone has since edited
 * alone.
 */
const seed = defineSeed({
  name: '202610070003_initial_devices',
  transaction: true,

  run: async (context) => {
    const devices = context.repository('devices');
    const now = new Date();

    for (const device of DEVICES) {
      const existing = await devices.findOne({
        filter: { code: device.code },
      });
      if (existing) continue;

      await devices.createOne({
        values: {
          code: device.code,
          name: device.name,
          status: device.status,
          notes: device.notes,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
