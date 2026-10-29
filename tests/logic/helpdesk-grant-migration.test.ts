// @vitest-environment node
import { describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202610200001_grant_requester_close_reopen.ts';

type Action = { action: string; policy?: unknown };
type Grant = { resource: { type: string; id: string }; actions: Action[] };

interface EmployeeRow {
  id: string;
  key: string;
  grants: Grant[] | null;
}

interface UpdateCall {
  filter: { id: string };
  values: { grants: Grant[]; updatedAt: Date };
}

const ticketAction = (action: string): Action => ({
  action,
  policy: { type: 'composite', scopes: { ticket: 'helpdesk.ownTickets' } },
});

const ticketGrant = (...actions: string[]): Grant => ({
  resource: { type: 'composite', id: 'helpdesk.tickets' },
  actions: actions.map(ticketAction),
});

const otherGrant: Grant = {
  resource: { type: 'composite', id: 'helpdesk.settings' },
  actions: [{ action: 'view' }],
};

const createContext = (employee: EmployeeRow | null) => {
  const repositoryCalls: string[] = [];
  const updates: UpdateCall[] = [];
  const context = {
    builder: { hasCollection: async () => false },
    repository: (name: string) => {
      repositoryCalls.push(name);
      return {
        findOne: async () => employee,
        updateOne: async (call: UpdateCall) => {
          updates.push(call);
          if (employee) employee.grants = call.values.grants;
        },
      };
    },
  };
  return { context, repositoryCalls, updates };
};

describe('202610200001_grant_requester_close_reopen', () => {
  it('does nothing while the authorization Collections are absent', async () => {
    const { context, repositoryCalls, updates } = createContext({
      id: 'employee',
      key: 'employee',
      grants: [ticketGrant('view', 'create')],
    });

    await migration.up(context as never);
    await migration.down(context as never);

    expect(repositoryCalls).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('appends the confirmation actions without touching the other grants', async () => {
    const employee: EmployeeRow = {
      id: 'employee',
      key: 'employee',
      grants: [otherGrant, ticketGrant('view', 'create', 'comment')],
    };
    const { context, updates } = createContext(employee);
    context.builder.hasCollection = async () => true;

    await migration.up(context as never);

    expect(updates).toHaveLength(1);
    expect(updates[0].filter).toEqual({ id: 'employee' });
    expect(updates[0].values.updatedAt).toBeInstanceOf(Date);
    expect(updates[0].values.grants).toEqual([
      otherGrant,
      ticketGrant('view', 'create', 'comment', 'reopen', 'close'),
    ]);

    await migration.down(context as never);

    expect(updates).toHaveLength(2);
    expect(updates[1].values.grants).toEqual([
      otherGrant,
      ticketGrant('view', 'create', 'comment'),
    ]);
  });

  it('leaves a set that already has the actions alone', async () => {
    const employee: EmployeeRow = {
      id: 'employee',
      key: 'employee',
      grants: [ticketGrant('view', 'reopen', 'close')],
    };
    const { context, updates } = createContext(employee);
    context.builder.hasCollection = async () => true;

    await migration.up(context as never);

    expect(updates).toEqual([]);
  });
});
