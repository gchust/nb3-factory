import { defineSeed } from '@nocobase/db';

interface EquipmentRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly notes: string | null;
}

/**
 * Two fictional devices for a new installation. Sample data, so it loads only with
 * `APP_SAMPLE_DATA=true` or `pnpm nocobase db sample`.
 *
 * Matching by `code` keeps the seed idempotent and preserves whatever someone later changed on a row:
 * a second run finds the existing device and leaves it alone.
 */
const seed = defineSeed({
  name: '202610070001_equipment_sample_devices',
  sample: true,

  // The seeder calls this as a plain function; `this` is never used.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  run: async ({ repository }) => {
    const equipment = repository<EquipmentRecord>('equipment');
    const samples = [
      {
        code: 'EQ-001',
        name: 'Field Camera',
        status: 'available',
        notes: 'Compact camera for site surveys.',
      },
      {
        code: 'EQ-002',
        name: 'Portable Projector',
        status: 'borrowed',
        notes: 'Currently with the training team.',
      },
    ] as const;

    for (const sample of samples) {
      const existing = await equipment.findOne({
        filter: { code: sample.code },
      });
      if (!existing) {
        await equipment.createOne({ values: sample });
      }
    }
  },
});

export default seed;
