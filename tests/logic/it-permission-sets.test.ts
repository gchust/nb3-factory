// @vitest-environment node

import { condition } from '@nocobase/app-plugin-authorization/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { RecordAccessDefinition } from '@nocobase/authorization/core';
import { describe, expect, it, vi } from 'vitest';

import {
  IT_EMPLOYEE_SET,
  IT_HANDLER_SET,
  itEmployee,
  itHandler,
  itRequestsPageGrant,
} from '../../database/main/seeds/202610010010_it_permission_sets.js';
import { registerItRecordAccess } from '../../server/it/record-access.js';
import {
  IT_TICKETS_PAGE,
  IT_TICKETS_RESOURCE,
  itTickets,
} from '../../server/it/resources.js';

const COMPOSITE_RESOURCE = IT_TICKETS_RESOURCE;

/** The action names of a permission set's grants against the composite resource. */
function compositeActions(set: {
  readonly grants: readonly {
    readonly resource: { readonly type: string; readonly id: string };
    readonly actions: readonly { readonly action: string }[];
  }[];
}): string[] {
  return set.grants
    .filter(
      (grant) =>
        grant.resource.type === 'composite' &&
        grant.resource.id === COMPOSITE_RESOURCE,
    )
    .flatMap((grant) => grant.actions.map((action) => action.action))
    .sort();
}

/** The data scope a set chose for one composite action. */
function chosenScope(
  set: {
    readonly grants: readonly {
      readonly resource: { readonly type: string; readonly id: string };
      readonly actions: readonly {
        readonly action: string;
        readonly policy?: Readonly<Record<string, unknown>>;
      }[];
    }[];
  },
  action: string,
): unknown {
  const entry = set.grants
    .flatMap((grant) => grant.actions)
    .find((candidate) => candidate.action === action);
  const policy = entry?.policy as
    { readonly scopes?: Readonly<Record<string, unknown>> } | undefined;
  return policy?.scopes?.tickets;
}

describe('IT permission sets', () => {
  it('declares one employee set and one handler set', () => {
    expect(itEmployee.key).toBe(IT_EMPLOYEE_SET);
    expect(itHandler.key).toBe(IT_HANDLER_SET);
    expect(itEmployee.title).toEqual({
      key: 'it.set.employee',
      ns: 'nb3-factory',
    });
    expect(itHandler.title).toEqual({
      key: 'it.set.handler',
      ns: 'nb3-factory',
    });
  });

  it('grants both responsibilities access to the IT requests page', () => {
    expect(itRequestsPageGrant.resource).toEqual({
      type: 'page',
      id: IT_TICKETS_PAGE,
    });
    for (const set of [itEmployee, itHandler]) {
      const pageGrant = set.grants.find(
        (grant) => grant.resource.type === 'page',
      );
      expect(pageGrant?.resource).toEqual({
        type: 'page',
        id: itRequestsPageGrant.resource.id,
      });
      expect(pageGrant?.actions).toEqual([{ action: 'access' }]);
    }
  });

  it('grants the composite resource the server declares', () => {
    for (const set of [itEmployee, itHandler]) {
      const compositeGrant = set.grants.find(
        (grant) => grant.resource.type === 'composite',
      );
      expect(compositeGrant?.resource).toEqual({
        type: 'composite',
        id: IT_TICKETS_RESOURCE,
      });
    }
  });

  it('lets an employee view and submit only, never handle', () => {
    // No `handle` grant is what makes start/complete answer 403 for an employee.
    expect(compositeActions(itEmployee)).toEqual(['create', 'view']);
    expect(chosenScope(itEmployee, 'view')).toBe('it.submittedByMe');
    expect(chosenScope(itEmployee, 'create')).toBe('it.submittedByMe');
  });

  it('lets a handler view, submit and handle every ticket', () => {
    expect(compositeActions(itHandler)).toEqual(['create', 'handle', 'view']);
    expect(chosenScope(itHandler, 'view')).toBe('allRecords');
    expect(chosenScope(itHandler, 'create')).toBe('allRecords');
    expect(chosenScope(itHandler, 'handle')).toBe('allRecords');
  });

  it('registers the composite resource the sets are granted against', () => {
    const definition = itTickets.build();
    expect(definition.name).toBe(COMPOSITE_RESOURCE);
    expect(definition.actions.map((action) => action.name)).toEqual([
      'view',
      'create',
      'handle',
    ]);
    // Each action composes exactly the collection the service reads and writes.
    for (const action of definition.actions) {
      expect(action.grants).toHaveLength(1);
      expect(action.grants[0].resource).toEqual({
        type: 'database.collection',
        id: 'itTickets',
      });
    }
  });
});

describe('IT submittedByMe record access', () => {
  it('selects the signed-in user own submissions', () => {
    const definitions = captureDefinitions();
    expect(definitions).toHaveLength(1);
    const definition = definitions[0];
    expect(definition.key).toBe('it.submittedByMe');
    expect(definition.collections).toEqual(['itTickets']);

    const scope = definition.resolve({
      principal: { type: 'user', id: 'user-1' },
      collection: 'itTickets',
      action: 'read',
      params: undefined,
    });
    expect(scope).toEqual(condition('submitterId', '$eq', 'user-1'));
    // The set must name the scope this resolver actually registers.
    expect(chosenScope(itEmployee, 'view')).toBe(definition.key);
  });

  it('selects nothing for a principal that is not a user', () => {
    const definition = captureDefinitions()[0];
    expect(
      definition.resolve({
        principal: { type: 'team', id: 'team-1' },
        collection: 'itTickets',
        action: 'read',
        params: undefined,
      }),
    ).toBe(false);
  });
});

function captureDefinitions(): RecordAccessDefinition[] {
  const captured: RecordAccessDefinition[] = [];
  const define = vi.fn((value: { build(): RecordAccessDefinition }) => {
    captured.push(value.build());
    return { key: 'it.submittedByMe', collections: ['itTickets'] };
  });
  registerItRecordAccess({
    recordAccess: { define },
  } as unknown as AppAuthorization);
  return captured;
}
