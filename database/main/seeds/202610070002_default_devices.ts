import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * The two devices the ledger starts with.
 *
 * They are fictional on purpose and contain no real business data. The business asked for them to exist after the
 * application is installed, so this is a required seed rather than a `sample: true` one: sample data only loads when
 * the installation sets `APP_SAMPLE_DATA`, and required data must not depend on that. See `database/main/seeds/AGENTS.md`.
 */
const DEFAULT_DEVICES = [
  { code: 'DEV-LAP-0001', name: 'Aurora Book 14', status: 'borrowed' },
  { code: 'DEV-CAM-0002', name: 'Nimbus Cam 4K', status: 'available' },
] as const;

/**
 * Loads the default devices once. It touches `devices` only through the connection's `query` adapter, so it works
 * whether or not the `devices` Collection has been materialized into metadata.
 *
 * Idempotent: it inserts only the codes that are missing and never rewrites an existing row, so a device that a user
 * has edited (or a row with one of these codes already present) is left alone.
 */
const seed: SeedDefinition = defineSeed({
  name: '202610070002_default_devices',

  async run({ query }: SeedContext): Promise<void> {
    for (const device of DEFAULT_DEVICES) {
      const existing = await query
        .selectFrom('devices')
        .select('id')
        .where('code', '=', device.code)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('devices')
        .values({
          code: device.code,
          name: device.name,
          status: device.status,
        })
        .execute();
    }
  },
});

export default seed;
