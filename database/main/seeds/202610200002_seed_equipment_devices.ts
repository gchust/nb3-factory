import { defineSeed } from '@nocobase/db';

/** Fixed so the ledger's two starting rows read the same on every fresh install. */
const seededAt = new Date('2026-10-01T00:00:00.000Z');

/**
 * The two devices the office starts from: one available, one already borrowed, so the status filter has something
 * to show on a fresh install. `upsertOne` makes a re-run idempotent, keyed by the ledger number.
 *
 * These are installation data rather than sample data: the requirement is that the ledger arrives with these two
 * rows, so they are written here without `sample: true` and appear even when sample data is not loaded.
 */
const seed = defineSeed({
  name: '202610200002_seed_equipment_devices',

  async run(context) {
    const equipment = context.repository('equipment');

    await equipment.upsertOne({
      filter: { code: 'EQ-0001' },
      create: {
        code: 'EQ-0001',
        name: 'Dell Latitude 5440',
        status: 'available',
        notes: 'Charger and USB-C dock are in the top drawer.',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      update: {
        name: 'Dell Latitude 5440',
        status: 'available',
        notes: 'Charger and USB-C dock are in the top drawer.',
        updatedAt: seededAt,
      },
    });

    await equipment.upsertOne({
      filter: { code: 'EQ-0002' },
      create: {
        code: 'EQ-0002',
        name: 'Epson EB-X06 Projector',
        status: 'borrowed',
        notes: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      update: {
        name: 'Epson EB-X06 Projector',
        status: 'borrowed',
        notes: null,
        updatedAt: seededAt,
      },
    });
  },
});

export default seed;
