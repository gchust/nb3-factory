import type { DatabaseManager } from '@nocobase/db';

/**
 * The row shapes this workflow reads. They are declared here rather than
 * imported from the application's service because a Workflow Artifact is
 * loaded from its own immutable directory: a handler may only import installed
 * packages and files inside its own package, so the workflow carries the small
 * part of the schema it needs.
 */
export interface WorkOrderRow {
  readonly id: string;
  readonly orderNo: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly groupId?: string | null;
  readonly assigneeId?: string | null;
  readonly createdById?: string | null;
}

export interface GroupMemberRow {
  readonly userId: string;
  readonly groupId: string;
  readonly memberRole: string;
  readonly active: boolean;
}

export async function readOrder(
  database: DatabaseManager,
  id: string,
): Promise<WorkOrderRow | undefined> {
  return database
    .repository<WorkOrderRow>('workOrders')
    .findOne({ filter: { id } });
}

/**
 * The engineer to auto-assign an urgent order to: the least-loaded active
 * member of the order's service group, or of the whole desk when the order has
 * no group. Supervisors are only chosen when their group has no engineer, so an
 * order in a group with nobody available returns `null` and the run records a
 * real acceptance failure instead of silently assigning outside the team.
 */
export async function pickAssignee(
  database: DatabaseManager,
  groupId: string | null | undefined,
): Promise<string | null> {
  const members = await database
    .repository<GroupMemberRow>('serviceGroupMembers')
    .findMany({ filter: (f) => f.boolean('active').isTrue() });
  const pool = members.filter(
    (member) => member.active && (!groupId || member.groupId === groupId),
  );
  if (!pool.length) return null;
  const open = await database
    .repository<WorkOrderRow>('workOrders')
    .findMany({ filter: (f) => f.string('status').ne('closed') });
  const load = new Map<string, number>();
  for (const row of open) {
    if (row.assigneeId) {
      load.set(row.assigneeId, (load.get(row.assigneeId) ?? 0) + 1);
    }
  }
  const engineers = pool.filter((member) => member.memberRole !== 'supervisor');
  const candidates = engineers.length ? engineers : pool;
  let best: string | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const member of candidates) {
    const current = load.get(member.userId) ?? 0;
    if (current < bestLoad) {
      bestLoad = current;
      best = member.userId;
    }
  }
  return best;
}
