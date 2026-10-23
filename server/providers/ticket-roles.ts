import type { DatabaseConnection } from '@nocobase/db';

import type { TicketRoleReader } from '../lifecycles/ticket-types.js';

/** The permission sets the ticket feature assigns business meaning to. */
export const TICKET_ROOT_SET = 'root';
export const TICKET_SERVICE_DESK_SET = 'service-desk';
export const TICKET_ENGINEER_SET = 'engineer';
export const TICKET_EMPLOYEE_SET = 'employee';

/**
 * Reads who holds which business role.
 *
 * It reads the assignment table directly rather than through the authorization service, because every caller of it
 * is either inside the lifecycle's transaction or inside an effect that runs right after one. Asking the authorization
 * service would open a second connection while SQLite still holds the transaction's single one, and the request would
 * deadlock. One indexed lookup on `(subjectType, subjectId)` is also all this needs.
 */
export class TicketRoleService implements TicketRoleReader {
  constructor(private readonly connection: DatabaseConnection) {}

  private async permissionSetKeys(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }
    const rows = await this.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('permissionSetKey')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', userId)
      .execute();
    return rows.map((row) => String(row.permissionSetKey));
  }

  async isAdmin(userId: string): Promise<boolean> {
    return (await this.permissionSetKeys(userId)).includes(TICKET_ROOT_SET);
  }

  async isServiceDesk(userId: string): Promise<boolean> {
    const keys = await this.permissionSetKeys(userId);
    return (
      keys.includes(TICKET_ROOT_SET) || keys.includes(TICKET_SERVICE_DESK_SET)
    );
  }

  async isEngineer(userId: string): Promise<boolean> {
    const keys = await this.permissionSetKeys(userId);
    return keys.includes(TICKET_ROOT_SET) || keys.includes(TICKET_ENGINEER_SET);
  }

  async serviceDeskUserIds(): Promise<string[]> {
    const rows = await this.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', 'in', [
        TICKET_SERVICE_DESK_SET,
        TICKET_ROOT_SET,
      ])
      .execute();
    return [
      ...new Set(rows.map((row) => String(row.subjectId)).filter(Boolean)),
    ];
  }

  /** The people the service desk can hand a ticket to. */
  async engineerUserIds(): Promise<string[]> {
    const rows = await this.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', 'in', [
        TICKET_ENGINEER_SET,
        TICKET_SERVICE_DESK_SET,
        TICKET_ROOT_SET,
      ])
      .execute();
    return [
      ...new Set(rows.map((row) => String(row.subjectId)).filter(Boolean)),
    ];
  }
}
