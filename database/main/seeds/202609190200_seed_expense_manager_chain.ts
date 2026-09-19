import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Fills in the direct-manager link for the demo accounts that the original
 * expense seed left unset.
 *
 * A reimbursement can only be submitted when its owner has a direct manager, so
 * without this the department managers, finance and the system administrator
 * cannot try the submit flow. Managers and finance report to the administrator,
 * and the administrator reports to a department manager, which keeps every demo
 * role able to create and submit a reimbursement while self-approval stays
 * blocked.
 *
 * This is a separate seed rather than an edit to the demo seed: an executed
 * seed's checksum is part of its history, so an existing installation could not
 * re-run a changed one. Links are only filled when missing, so a repeated run is
 * a no-op and a relationship someone changed is never overwritten.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609190200_seed_expense_manager_chain',

  async run({ query }) {
    await ensureManagerChain(query);
  },
});

async function ensureManagerChain(query: QueryAdapter): Promise<void> {
  const admin = await findAdministratorUserId(query);
  const now = new Date();
  if (admin) {
    await query
      .updateTable('expenseEmployees')
      .set({ managerUserId: admin, updatedAt: now })
      .where('managerUserId', 'is', null)
      .where('role', 'in', ['manager', 'finance'])
      .execute();
  }
  const firstManager = await query
    .selectFrom('expenseEmployees')
    .select(['id', 'userId'])
    .where('role', '=', 'manager')
    .orderBy('id', 'asc')
    .executeTakeFirst();
  if (firstManager) {
    await query
      .updateTable('expenseEmployees')
      .set({ managerUserId: String(firstManager.userId), updatedAt: now })
      .where('managerUserId', 'is', null)
      .where('role', '=', 'admin')
      .execute();
  }
}

async function findAdministratorUserId(
  query: QueryAdapter,
): Promise<string | null> {
  const assignment = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['subjectType', 'subjectId'])
    .where('permissionSetKey', '=', 'system-administrator')
    .executeTakeFirst();
  if (assignment && assignment.subjectType === 'user') {
    return String(assignment.subjectId);
  }
  const user = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', 'nocobase')
    .executeTakeFirst();
  return user ? String(user.id) : null;
}

export default seed;
