// @vitest-environment node

import { describeMigration } from '@nocobase/app-testing/server';
import { fileURLToPath } from 'node:url';

/**
 * The migration is loaded from the directory the application runs it from, so the test applies the same file the
 * application applies, and `describeMigration` rolls it back and applies it again around the assertions below.
 */
describeMigration('202610010001_create_tickets', {
  sources: [
    {
      packageName: 'app',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    const tickets = expectCollection('tickets');
    await tickets.toExist();

    // Every field the feature reads or writes, spelled out so a dropped column fails here rather than in production.
    for (const field of [
      'id',
      'title',
      'category',
      'description',
      'status',
      'resolution',
      'submitterId',
      'handlerId',
      'startedAt',
      'completedAt',
      'createdAt',
      'updatedAt',
    ]) {
      await tickets.toHaveField(field);
    }

    // The columns the ticket state machine depends on are required or optional exactly as the routes assume.
    await tickets.toHaveField('title', { nullable: false });
    await tickets.toHaveField('category', { nullable: false });
    await tickets.toHaveField('status', { nullable: false });
    await tickets.toHaveField('submitterId', { nullable: false });
    await tickets.toHaveField('createdAt', { nullable: false });
    await tickets.toHaveField('description', { nullable: true });
    await tickets.toHaveField('resolution', { nullable: true });
    await tickets.toHaveField('handlerId', { nullable: true });
    await tickets.toHaveField('startedAt', { nullable: true });
    await tickets.toHaveField('completedAt', { nullable: true });

    // The list filters by status and every ticket row is scoped by its submitter or handler.
    await tickets.toHaveIndex(['status']);
    await tickets.toHaveIndex(['submitterId']);
    await tickets.toHaveIndex(['handlerId']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('tickets').not.toExist();
  },
});
