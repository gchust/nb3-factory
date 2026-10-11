import { defineSeed } from '@nocobase/db';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The three todos the build test requires: one past due and incomplete, one still in the future, and one already
 * completed but also past its due time, so a run that wrongly keyed only on `dueAt` would label the completed one
 * expired and the difference is observable.
 *
 * This is a plain seed rather than a sample seed on purpose. The factory's database step applies seeds with
 * `nocobase db apply` against a fresh connection and does not run `db sample` or set `APP_SAMPLE_DATA`, so a
 * `sample: true` seed is recorded as skipped and never runs — leaving the verification database empty. These rows are
 * part of this task's required initial data, so they load with the migration the same way.
 *
 * The seed is idempotent: each record is keyed on its title, so re-running creates nothing a second time.
 */
export default defineSeed({
  name: '202610070002_default_todos',

  async run(context) {
    const todos = context.repository('todos');
    const now = Date.now();
    const samples = [
      {
        title: 'Submit the overdue quarterly report',
        dueAt: new Date(now - 2 * HOUR_MS),
        completed: false,
        expired: false,
      },
      {
        title: 'Review the design draft next week',
        dueAt: new Date(now + 7 * 24 * HOUR_MS),
        completed: false,
        expired: false,
      },
      {
        title: 'Archive the completed meeting notes',
        dueAt: new Date(now - 3 * HOUR_MS),
        completed: true,
        expired: false,
      },
    ] as const;

    for (const sample of samples) {
      const existing = await todos.findOne({
        filter: { title: sample.title },
      });
      if (existing) continue;

      await todos.createOne({
        values: { ...sample, createdAt: new Date(now) },
      });
    }
  },
});
