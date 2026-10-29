import type { DatabaseConnection } from '@nocobase/db';
import type { TicketPeople } from './types.js';

interface AssignmentRow {
  id: string;
  subjectType: string;
  subjectId: string;
  permissionSetKey: string;
}

interface UserRow {
  id: string;
  name: string;
  username?: string | null;
  email: string;
}

export class TicketPeopleService implements TicketPeople {
  constructor(private readonly database: DatabaseConnection) {}

  private assignments() {
    return this.database.repository<AssignmentRow>(
      'authorizationPermissionSetAssignments',
    );
  }

  async hasRole(userId: string, roleKey: string): Promise<boolean> {
    const row = await this.assignments().findOne({
      filter: {
        subjectType: 'user',
        subjectId: userId,
        permissionSetKey: roleKey,
      },
    });
    return Boolean(row);
  }

  async isRoot(userId: string): Promise<boolean> {
    return this.hasRole(userId, 'root');
  }

  async namesByIds(
    ids: readonly string[],
  ): Promise<{ id: string; name: string }[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];

    const users = await this.database.repository<UserRow>('user').findMany({
      filter: (filter) =>
        filter.or(unique.map((id) => filter.string('id').eq(id))),
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name || user.username || user.email,
    }));
  }

  async listMembers(roleKey: string): Promise<{ id: string; name: string }[]> {
    const assignments = await this.assignments().findMany({
      filter: {
        subjectType: 'user',
        permissionSetKey: roleKey,
      },
    });
    return this.namesByIds(assignments.map((item) => item.subjectId));
  }
}
