import { defineSeed } from '@nocobase/db';
import { demoAccounts, demoTeams } from '../../seed-data/accounts.ts';

/**
 * Creates the two engineer groups as authorization subjects. Group membership
 * is data, not code: the permission set is assigned to the group, and moving an
 * engineer between groups changes what they can reach without an edit here.
 */
const seed = defineSeed({
  name: '202609100011_service_engineer_teams',
  async run(context) {
    const { query } = context;
    const repository = context.repository.bind(context);
    const now = new Date().toISOString();
    const teams = repository<{
      id: number;
      code: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
    }>('serviceTeams');
    const members = repository<{
      id: number;
      teamId: number;
      userId: string;
      memberRole: string | null;
      createdAt: string;
      updatedAt: string;
    }>('serviceTeamMembers');

    const teamIds = new Map<string, number>();
    for (const team of demoTeams) {
      const existing = await teams.findOne({
        filter: { code: team.code },
        select: (select) => select.fields('id'),
      });
      if (existing) {
        teamIds.set(team.code, Number(existing.id));
        continue;
      }
      const created = await teams.createOne({
        values: {
          code: team.code,
          name: team.name,
          description: team.description,
          createdAt: now,
          updatedAt: now,
        },
        select: (select) => select.fields('id'),
      });
      teamIds.set(team.code, Number(created.record.id));
    }

    // Membership is derived from the demo account list so the two seeds cannot
    // drift: an engineer account declares its group.
    for (const account of demoAccounts) {
      if (account.role !== 'engineer' || !account.group) continue;
      const teamId = teamIds.get(account.group);
      if (!teamId) continue;
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username.toLowerCase())
        .executeTakeFirst();
      if (!user) continue;
      const userId = String(user.id);
      const existing = await members.findOne({
        filter: { teamId, userId },
        select: (select) => select.fields('id'),
      });
      if (existing) continue;
      await members.createOne({
        values: {
          teamId,
          userId,
          memberRole: 'member',
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

export default seed;
