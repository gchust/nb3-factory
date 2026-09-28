import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The two devices the task asks for. A seed only creates missing rows: a code that already exists is left exactly as
 * it is, so an administrator renaming a device keeps that wording after a later install.
 */
const DEFAULT_DEVICES: readonly {
  readonly code: string;
  readonly name: string;
}[] = [
  { code: 'DEV-001', name: 'Temperature sensor' },
  { code: 'DEV-002', name: 'Pressure gauge' },
];

const seed: SeedDefinition = defineSeed({
  name: '202609280002_default_devices',
  transaction: true,
  async run({ query }) {
    for (const device of DEFAULT_DEVICES) {
      const existing = await query
        .selectFrom('devices')
        .select('id')
        .where('code', '=', device.code)
        .executeTakeFirst();
      if (existing) continue;
      await query.insertInto('devices').values(device).execute();
    }
  },
});

export default seed;
