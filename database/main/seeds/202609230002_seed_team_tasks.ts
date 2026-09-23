import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The three fictional tasks the checklist starts from.
 *
 * Timestamps are fixed so the seeded rows are reproducible, and every row is
 * inserted only when its id is absent: re-running the seed never overwrites a
 * task an administrator has since edited or completed.
 */
const initialTasks = [
  {
    id: 1,
    title: 'Prepare the weekly team sync agenda',
    notes: 'Collect blockers from everyone before the meeting starts.',
    status: 'pending',
  },
  {
    id: 2,
    title: 'Review the updated onboarding checklist',
    notes: null,
    status: 'pending',
  },
  {
    id: 3,
    title: 'Publish the release notes for the last sprint',
    notes: 'Cover the new filters and the fixed export flow.',
    status: 'done',
  },
] as const;

const seededAt = new Date('2026-09-01T09:00:00.000Z');

const seed: SeedDefinition = defineSeed({
  name: '202609230002_seed_team_tasks',

  async run({ query }) {
    for (const task of initialTasks) {
      const existing = await query
        .selectFrom('teamTasks')
        .select('id')
        .where('id', '=', task.id)
        .executeTakeFirst();

      if (existing) {
        continue;
      }

      await query
        .insertInto('teamTasks')
        .values({
          id: task.id,
          title: task.title,
          notes: task.notes,
          status: task.status,
          createdAt: seededAt,
          updatedAt: seededAt,
        })
        .execute();
    }
  },
});

export default seed;
