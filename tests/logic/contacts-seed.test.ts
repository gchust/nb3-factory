// @vitest-environment node

import type { SeedContext } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import sampleContactsSeed from '../../database/main/seeds/202609020002_sample_contacts.ts';

/**
 * Builds the smallest `SeedContext` the seed touches. The seed only reads a row
 * count and inserts, so the rest of the interface is left out on purpose.
 */
function createSeedContext(existingRows: number) {
  const createOne = vi.fn(async () => ({}));
  const count = vi.fn(async () => existingRows);
  const context = {
    repository: () => ({ count, createOne }),
  };
  return {
    context: context as unknown as SeedContext,
    count,
    createOne,
  };
}

describe('sample contacts seed', () => {
  it('inserts the five samples when the table is empty', async () => {
    const { context, createOne } = createSeedContext(0);

    await sampleContactsSeed.run(context);

    expect(createOne).toHaveBeenCalledTimes(5);
    const inserted = createOne.mock.calls.map(
      ([options]: [{ values: { department: string } }]) =>
        options.values.department,
    );
    // The samples have to cover all three departments the filter offers.
    expect(new Set(inserted)).toEqual(new Set(['rd', 'sales', 'admin']));
  });

  it('never duplicates samples when the table already has rows', async () => {
    const { context, createOne } = createSeedContext(3);

    await sampleContactsSeed.run(context);

    expect(createOne).not.toHaveBeenCalled();
  });
});
