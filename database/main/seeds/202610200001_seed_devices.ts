import { defineSeed } from '@nocobase/db';

interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  status: string;
}

const devices: readonly DeviceRecord[] = [
  {
    id: 'device-ledger-001',
    code: 'DEV-001',
    name: 'Field camera kit',
    status: 'available',
  },
  {
    id: 'device-ledger-002',
    code: 'DEV-002',
    name: 'Portable projector',
    status: 'borrowed',
  },
];

/**
 * The two devices a fresh ledger starts with. Existing rows are left exactly as
 * they are, so a repeated install or upgrade never overwrites a user's edits.
 */
export default defineSeed({
  name: '202610200001_seed_devices',

  async run(context) {
    const repositoryForDevices = context.repository<DeviceRecord>('devices');

    for (const device of devices) {
      const existing = await repositoryForDevices.findOne({
        filter: { id: device.id },
      });
      if (!existing) {
        await repositoryForDevices.createOne({ values: device });
      }
    }
  },
});
