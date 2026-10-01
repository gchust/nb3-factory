// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  itEmployeePermissionSet,
  itHandlerPermissionSet,
  IT_DEMO_TICKETS,
  IT_DEMO_USERS,
} from '../../database/seed-data/it-tickets.js';
import {
  itTicketsResource,
  ticketComplete,
  ticketCreate,
  ticketRead,
  ticketStart,
} from '../../server/it-tickets/resources.js';

type GrantAction = {
  readonly action: string;
  readonly scopeKey?: string;
  readonly policy?: {
    readonly type: string;
    readonly fields?: readonly string[];
  };
};

function compositeActions() {
  const definition = itTicketsResource.build();
  const byName = new Map(
    definition.actions.map((action) => [
      action.name,
      {
        dataScopes: action.dataScopes ?? [],
        grants: action.grants.flatMap((grant) =>
          grant.actions.map((entry) => ({
            ...(entry as unknown as GrantAction),
            resource: grant.resource,
          })),
        ),
      },
    ]),
  );
  return { definition, byName };
}

function databaseActions(builder: {
  build(): { actions: readonly unknown[] };
}) {
  return builder.build().actions as readonly GrantAction[];
}

describe('IT ticket composite resource', () => {
  it('declares exactly view, create, start and complete', () => {
    const { definition } = compositeActions();
    expect(definition.name).toBe('it.tickets');
    expect(definition.actions.map((action) => action.name).sort()).toEqual([
      'complete',
      'create',
      'start',
      'view',
    ]);
  });

  it('binds every action under one data scope targeting the itTickets collection', () => {
    const { byName } = compositeActions();
    for (const name of ['view', 'create', 'start', 'complete']) {
      const action = byName.get(name);
      expect({ name, defined: action !== undefined }).toEqual({
        name,
        defined: true,
      });
      expect(action?.dataScopes).toEqual([
        expect.objectContaining({ key: 'tickets' }),
      ]);
      expect(action?.grants.length).toBeGreaterThanOrEqual(1);
      for (const grant of action?.grants ?? []) {
        expect(grant.scopeKey).toBe('tickets');
        expect(grant.resource).toEqual({
          type: 'database.collection',
          id: 'itTickets',
        });
      }
    }
  });

  it('lets an administrator choose an employee-owned or all-record scope for read and create', () => {
    const { byName } = compositeActions();
    expect(byName.get('view')?.dataScopes[0]).toMatchObject({
      options: ['recordsIOwn', 'allRecords'],
      defaultValue: 'recordsIOwn',
    });
    expect(byName.get('create')?.dataScopes[0]).toMatchObject({
      options: ['recordsIOwn', 'allRecords'],
      defaultValue: 'recordsIOwn',
    });
  });

  it('restricts handling actions to an all-record scope', () => {
    const { byName } = compositeActions();
    for (const name of ['start', 'complete']) {
      expect(byName.get(name)?.dataScopes[0]).toMatchObject({
        options: ['allRecords'],
        defaultValue: 'allRecords',
      });
    }
  });
});

describe('IT ticket database permissions', () => {
  it('grants read alongside create, because creating returns the inserted row', () => {
    const actions = databaseActions(ticketCreate).map((entry) => entry.action);
    expect(actions).toContain('read');
    expect(actions).toContain('create');
  });

  it('grants read alongside every update', () => {
    for (const builder of [ticketStart, ticketComplete]) {
      expect(databaseActions(builder).map((entry) => entry.action)).toEqual(
        expect.arrayContaining(['read', 'update']),
      );
    }
  });

  it('restricts start to the fields the transition writes', () => {
    const update = databaseActions(ticketStart).find(
      (entry) => entry.action === 'update',
    );
    expect(update?.policy?.fields).toEqual([
      'status',
      'handlerId',
      'startedAt',
      'updatedAt',
    ]);
  });

  it('restricts complete to the fields the transition writes', () => {
    const update = databaseActions(ticketComplete).find(
      (entry) => entry.action === 'update',
    );
    expect(update?.policy?.fields).toEqual([
      'status',
      'resolution',
      'completedAt',
      'updatedAt',
    ]);
  });

  it('lets every read permission choose the employee or all-record scope', () => {
    for (const builder of [
      ticketRead,
      ticketCreate,
      ticketStart,
      ticketComplete,
    ]) {
      expect(builder.build().resource).toEqual({
        type: 'database.collection',
        id: 'itTickets',
      });
    }
  });
});

describe('IT ticket permission sets', () => {
  it('gives employees the page, their own records, and creation only', () => {
    expect(itEmployeePermissionSet.key).toBe('it.employee');
    const grants = itEmployeePermissionSet.grants;
    expect(grants).toContainEqual({
      resource: { type: 'page', id: 'it.tickets' },
      actions: [{ action: 'access' }],
    });
    const composite = grants.find(
      (grant) => grant.resource.type === 'composite',
    );
    expect(composite?.resource).toEqual({
      type: 'composite',
      id: 'it.tickets',
    });
    expect(composite?.actions.map((action) => action.action).sort()).toEqual([
      'create',
      'view',
    ]);
    for (const action of composite?.actions ?? []) {
      expect(action).toMatchObject({
        policy: { type: 'composite', scopes: { tickets: 'recordsIOwn' } },
      });
    }
  });

  it('gives handlers the page, every record, and the handling actions only', () => {
    expect(itHandlerPermissionSet.key).toBe('it.handler');
    const grants = itHandlerPermissionSet.grants;
    expect(grants).toContainEqual({
      resource: { type: 'page', id: 'it.tickets' },
      actions: [{ action: 'access' }],
    });
    const composite = grants.find(
      (grant) => grant.resource.type === 'composite',
    );
    expect(composite?.actions.map((action) => action.action).sort()).toEqual([
      'complete',
      'start',
      'view',
    ]);
    for (const action of composite?.actions ?? []) {
      expect(action).toMatchObject({
        policy: { type: 'composite', scopes: { tickets: 'allRecords' } },
      });
    }
  });
});

describe('IT ticket demonstration fixtures', () => {
  it('ships two employees and one handler with fixed accounts', () => {
    expect(IT_DEMO_USERS).toHaveLength(3);
    expect(
      IT_DEMO_USERS.filter((user) => user.permissionSetKey === 'it.employee'),
    ).toHaveLength(2);
    expect(
      IT_DEMO_USERS.filter((user) => user.permissionSetKey === 'it.handler'),
    ).toHaveLength(1);
    for (const user of IT_DEMO_USERS) {
      expect(user.id).toMatch(/^it-demo-user-/u);
      expect(user.username.length).toBeGreaterThan(0);
      expect(user.email).toContain('@');
    }
  });

  it('ships three tickets covering the three lifecycle stages', () => {
    expect(IT_DEMO_TICKETS.map((ticket) => ticket.status)).toEqual([
      'pending',
      'in_progress',
      'completed',
    ]);
    for (const ticket of IT_DEMO_TICKETS) {
      expect(ticket.id).toMatch(/^it-demo-ticket-/u);
      expect(ticket.ownerUsername.length).toBeGreaterThan(0);
      expect(new Date(ticket.createdAt).toString()).not.toBe('Invalid Date');
    }
    const completed = IT_DEMO_TICKETS.find(
      (ticket) => ticket.status === 'completed',
    );
    expect(completed?.resolution).toBeTruthy();
    expect(completed?.completedAt).toBeTruthy();
  });
});
