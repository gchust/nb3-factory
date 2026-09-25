import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Inline, not imported: a seed file is loaded directly at runtime, so a
// relative import into `server/` would need `.js`-to-`.ts` resolution that only
// exists under the test transform. The seed test cross-checks these values
// against the server's constants.
const IT_TICKET_HANDLER_SET = 'it-ticket-handler';
const IT_TICKET_EMPLOYEE_SET = 'it-ticket-employee';
const IT_TICKET_LOCALE_NAMESPACE = 'nb3-factory';
const SAMPLE_HANDLER_USERNAME = 'it-handler';
const SAMPLE_EMPLOYEE_USERNAMES = ['it-employee-1', 'it-employee-2'] as const;

interface PermissionSetSeed {
  readonly key: string;
  readonly titleKey: string;
  readonly usernames: readonly string[];
}

const PERMISSION_SETS: readonly PermissionSetSeed[] = [
  {
    key: IT_TICKET_HANDLER_SET,
    titleKey: 'itTickets.roles.handler',
    usernames: [SAMPLE_HANDLER_USERNAME],
  },
  {
    key: IT_TICKET_EMPLOYEE_SET,
    titleKey: 'itTickets.roles.employee',
    usernames: [...SAMPLE_EMPLOYEE_USERNAMES],
  },
];

/**
 * The two IT ticket roles, expressed as ordinary Permission Sets so the Users
 * page can assign and revoke them without a second identity system.
 *
 * The sets carry no grants: they are role markers the ticket service reads.
 * Being unprotected, they show up in the Users page role picker.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609300003_it_tickets_create_permission_sets',
  async run({ query }) {
    const now = new Date();

    for (const definition of PERMISSION_SETS) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', definition.key)
        .executeTakeFirst();
      if (!existingSet) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: crypto.randomUUID(),
            key: definition.key,
            title: JSON.stringify({
              key: definition.titleKey,
              ns: IT_TICKET_LOCALE_NAMESPACE,
            }),
            grants: JSON.stringify([]),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      for (const rawUsername of definition.usernames) {
        const username = rawUsername.toLowerCase();
        const user = await query
          .selectFrom('user')
          .select('id')
          .where('username', '=', username)
          .executeTakeFirst();
        if (!user) {
          continue;
        }
        const userId = String(user.id);
        const assignmentId = `user:${userId}:${definition.key}`;
        const existingAssignment = await query
          .selectFrom('authorizationPermissionSetAssignments')
          .select('id')
          .where('id', '=', assignmentId)
          .executeTakeFirst();
        if (!existingAssignment) {
          await query
            .insertInto('authorizationPermissionSetAssignments')
            .values({
              id: assignmentId,
              subjectType: 'user',
              subjectId: userId,
              permissionSetKey: definition.key,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
        }
      }
    }
  },
});

export default seed;
