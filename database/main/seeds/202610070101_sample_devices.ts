import { defineSeed } from '@nocobase/db';

/** The two fictional devices to demonstrate the ledger with; the names are content, so they are not translated. */
const SAMPLE_DEVICES = [
  { code: 'D-1001', name: '会议室投影仪', status: 'available' },
  { code: 'D-1002', name: '测试用笔记本电脑', status: 'borrowed' },
] as const;

/**
 * Two example devices, so a fresh install has something to browse. Declared as a sample seed: it loads only when the
 * application installs its database with sample data enabled, and `pnpm nocobase db sample` loads it later in
 * development. `upsertOne` keyed on the unique `code` keeps a repeat run a no-op.
 */
export default defineSeed({
  name: '202610070101_sample_devices',
  sample: true,

  async run(context) {
    const devices = context.repository<{
      id: number;
      code: string;
      name: string;
      status: string;
    }>('devices');

    for (const device of SAMPLE_DEVICES) {
      await devices.upsertOne({
        filter: { code: device.code },
        create: { ...device },
        update: { name: device.name, status: device.status },
      });
    }
  },
});
