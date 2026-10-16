import { defineSeed } from '@nocobase/db';

/** A row of the `devices` table, as much of it as this seed reads and writes. */
interface DeviceRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly status: string;
}

/** The two devices and the values a first run stores for them. */
const startingDevices: readonly Pick<
  DeviceRecord,
  'code' | 'name' | 'status'
>[] = [
  { code: 'DEV-0001', name: 'Dell Latitude 5440', status: 'available' },
  { code: 'DEV-0002', name: 'iPad 9', status: 'borrowed' },
];

/**
 * The two devices the ledger starts with. They are required data rather than sample data, so the ledger is not empty
 * on first sign-in.
 *
 * The seed inserts only a code the ledger does not have yet. A repeat run therefore adds nothing, and a device a user
 * has since renamed or re-statused keeps the values the user gave it.
 *
 * The names are stored once and shown as they are in both languages: a device name is user-entered content, and
 * nothing the application displays translates it.
 */
const seed = defineSeed({
  name: '202610070002_seed_devices',

  async run(context) {
    const devices = context.repository<DeviceRecord>('devices');

    for (const device of startingDevices) {
      const existing = await devices.findOne({ filter: { code: device.code } });
      if (existing) continue;
      await devices.createOne({ values: device });
    }
  },
});

export default seed;
