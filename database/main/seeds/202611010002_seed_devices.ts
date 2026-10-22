import { defineSeed } from '@nocobase/db';

interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The two devices the ledger starts with. This is installation data the application needs in order to be usable, not
 * sample data, so it runs on a fresh install without `APP_SAMPLE_DATA`.
 *
 * The rows carry fixed ids and the seed checks for an existing code before writing, so applying it twice leaves the
 * ledger unchanged and never overwrites what an operator has edited since.
 */
const SEEDED_DEVICES: readonly Omit<DeviceRecord, 'createdAt' | 'updatedAt'>[] =
  [
    {
      id: 'seed-device-0001',
      code: 'DEV-1001',
      name: 'ThinkPad T14 Laptop',
      status: 'available',
      notes: 'Office 3F, desk A-12.',
    },
    {
      id: 'seed-device-0002',
      code: 'DEV-1002',
      name: 'Epson EB-X06 Projector',
      status: 'borrowed',
      notes: 'Signed out to Marketing on 2026-11-01.',
    },
  ];

const seed = defineSeed({
  name: '202611010002_seed_devices',

  async run(context) {
    const devices = context.repository<DeviceRecord>('devices');
    for (const device of SEEDED_DEVICES) {
      if (await devices.exists({ filter: { code: device.code } })) continue;
      const now = new Date();
      await devices.createOne({
        values: { ...device, createdAt: now, updatedAt: now },
      });
    }
  },
});

export default seed;
