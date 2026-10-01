import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Creates two employee accounts and one processor account, each carrying an
 * ordinary Permission Set assignment.
 *
 * The assignment is the same mechanism an administrator uses for a real new
 * colleague, so the demo accounts are not special: deleting the assignment
 * leaves the account intact but without access, and assigning the set to a new
 * account grants that account the same work. The set keys are repeated here
 * rather than imported, because a Seed is a snapshot that has to keep meaning
 * the same thing as the Permission Sets it installs.
 */

/** The demo accounts, isolated to a local database. */
const DEMO_PASSWORD = 'Nocobase@123';

const EMPLOYEE_PERMISSION_SET = 'it-employee';
const PROCESSOR_PERMISSION_SET = 'it-processor';

interface DemoUser {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly permissionSet: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'employee1',
    name: 'Chen Ming',
    email: 'employee1@example.com',
    permissionSet: EMPLOYEE_PERMISSION_SET,
  },
  {
    username: 'employee2',
    name: 'Li Na',
    email: 'employee2@example.com',
    permissionSet: EMPLOYEE_PERMISSION_SET,
  },
  {
    username: 'technician',
    name: 'Wang Qiang',
    email: 'technician@example.com',
    permissionSet: PROCESSOR_PERMISSION_SET,
  },
];

/**
 * Creates two employee accounts and one processor account, each carrying an
 * ordinary Permission Set assignment.
 *
 * The assignment is the same mechanism an administrator uses for a real new
 * colleague, so the demo accounts are not special: deleting the assignment
 * leaves the account intact but without access, and assigning the set to a new
 * account grants that account the same work.
 */
const seed = defineSeed({
  name: '202609280003_it_support_demo_users',
  async run({ query }) {
    const now = new Date();
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const demo of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', demo.username)
        .executeTakeFirst();

      let userId: string;
      if (existing) {
        userId = String(existing.id);
      } else {
        userId = crypto.randomUUID();
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: demo.name,
            username: demo.username,
            email: demo.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      const assignmentId = `user:${userId}:${demo.permissionSet}`;
      const assignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (!assignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: assignmentId,
            subjectType: 'user',
            subjectId: userId,
            permissionSetKey: demo.permissionSet,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  },
});

export default seed;
