import { defineSeed } from '@nocobase/db';
import { demoAccounts } from '../../seed-data/accounts.ts';
import { SERVICE_TEAM_SUBJECT } from '../../../server/service-resources.ts';

/**
 * Assigns the initial permission sets. Accounts are resolved to real ids and
 * engineer groups become a group subject, so the assignment list survives a
 * rename of a demo account without editing this seed.
 */
const seed = defineSeed({
  name: '202609100013_service_permission_assignments',
  async run(context) {
    const { query } = context;
    const repository = context.repository.bind(context);
    const now = new Date();

    const userIdByRole = new Map<string, string>();
    for (const account of demoAccounts) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', account.username.toLowerCase())
        .executeTakeFirst();
      if (user) userIdByRole.set(account.username, String(user.id));
    }

    const teams = repository<{ id: number; code: string }>('serviceTeams');
    const teamIdByCode = new Map<string, number>();
    for (const row of await teams.findMany({
      select: (select) => select.fields('id', 'code'),
    })) {
      teamIdByCode.set(String(row.code), Number(row.id));
    }

    const assignments: { type: string; id: string; set: string }[] = [
      {
        type: 'user',
        id: userIdByRole.get('supervisor') ?? '',
        set: 'service-supervisor',
      },
      {
        type: 'user',
        id: userIdByRole.get('observer') ?? '',
        set: 'service-observer',
      },
      {
        type: 'user',
        id: userIdByRole.get('integration') ?? '',
        set: 'service-integration',
      },
    ];
    for (const code of ['A', 'B']) {
      const id = teamIdByCode.get(code);
      if (id !== undefined) {
        assignments.push({
          type: SERVICE_TEAM_SUBJECT,
          id: String(id),
          set: 'service-engineer',
        });
      }
    }

    for (const assignment of assignments) {
      if (!assignment.id) continue;
      const assignmentId = `${assignment.type}:${assignment.id}:${assignment.set}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: assignment.type,
          subjectId: assignment.id,
          permissionSetKey: assignment.set,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
