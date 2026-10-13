import { defineSeed } from '@nocobase/db';

/**
 * Puts the first account — the initial administrator, created by the authentication plugin's own seed — on the
 * service desk. Without it a fresh installation has tickets nobody can triage: only a helpdesk member may assign one.
 *
 * Required data, not sample data: it is idempotent, does nothing when a service desk member already exists, and runs
 * on every installation. Engineers are appointed from the "Service desk settings" page.
 */
export default defineSeed({
  name: '202611010001_service_desk_initial_helpdesk',
  async run(context) {
    const { query } = context;
    const existing = await query
      .selectFrom('serviceDeskStaff')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const firstUser = await query
      .selectFrom('user')
      .select(['id'])
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!firstUser) return;

    const now = new Date();
    await context
      .repository<{
        id: number;
        userId: string;
        role: string;
        createdAt: Date;
        updatedAt: Date;
      }>('serviceDeskStaff')
      .createOne({
        values: {
          userId: String(firstUser.id),
          role: 'helpdesk',
          createdAt: now,
          updatedAt: now,
        },
      });
  },
});
