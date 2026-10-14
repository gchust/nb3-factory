import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Two fictional devices so a fresh install has a non-empty ledger to look at.
 *
 * This is sample data, not data the application needs to run, so it is declared `sample: true`: it loads only when the
 * database is installed with `app.sampleData` set (`APP_SAMPLE_DATA=true`) and is recorded as skipped otherwise.
 * `pnpm nocobase db sample` loads what was skipped, in development.
 *
 * The names are Chinese on purpose and stay exactly as written — the application never translates user-entered data,
 * only its own copy. The language switch localizes the interface around these rows, not the rows themselves.
 *
 * The run is idempotent and never overwrites a user's edit: a device whose code already exists is left untouched, so
 * a repeat run changes nothing. `code` carries a unique constraint, which is the stable business key this keys on.
 */
const SAMPLE_DEVICES = [
  { code: 'DEV-001', name: '会议室投影仪', status: 'available' },
  { code: 'DEV-002', name: '笔记本电脑', status: 'borrowed' },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202610070002_sample_devices',
  sample: true,

  // An arrow function, and the whole context rather than a destructured
  // `repository`: `repository` is a method, so calling it off the context keeps
  // its `this` (the linter's `unbound-method` rule enforces this).
  run: async (context) => {
    const devices = context.repository('devices');
    for (const device of SAMPLE_DEVICES) {
      const existing = await devices.findOne({
        filter: { code: device.code },
        select: (select) => select.fields('id'),
      });
      if (existing) continue;
      await devices.createOne({ values: { ...device } });
    }
  },
});

export default seed;
