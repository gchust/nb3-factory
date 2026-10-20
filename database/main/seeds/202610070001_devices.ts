import { defineSeed } from '@nocobase/db';

/**
 * Two fictional devices so a new installation has a ledger to look at. Installation data, not sample data: the
 * business needs these records when the application is installed.
 *
 * Idempotent by code rather than by seed history alone: running the seed definition again, for example after a
 * database copy without its seed history, leaves an existing device and any edits made to it untouched.
 */
const devices = [
  {
    id: 'device-aurora-projector',
    code: 'DEV-1001',
    name: 'Aurora Projector',
    status: 'available' as const,
    notes: 'Portable projector kept in the meeting room.',
  },
  {
    id: 'device-field-camera',
    code: 'DEV-1002',
    name: 'Field Camera',
    status: 'borrowed' as const,
    notes: 'Checked out for the product launch shoot.',
  },
];

export default defineSeed({
  name: '202610070001_devices',

  async run(context) {
    const devicesRepository = context.repository('devices');

    for (const device of devices) {
      const existing = await devicesRepository.exists({
        filter: { code: device.code },
      });
      if (!existing) {
        await devicesRepository.createOne({ values: device });
      }
    }
  },
});
