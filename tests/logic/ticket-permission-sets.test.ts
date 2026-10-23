// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PermissionGrant } from '@nocobase/authorization/core';

import { tickets } from '../../server/tickets/resources.js';
import { ticketPermissionSets } from '../../database/main/seeds/202611200001_ticket_permission_sets.js';

/*
 * The permission model is declared in code and stored in the seed, and the two must not drift apart.
 *
 * The seed is self-contained by necessity: the database runner loads a seed as a module of its own, so it writes the
 * composite grant in its stored shape instead of calling `tickets.reference()`. This test is the link that keeps that
 * copy honest: every action and every data-scope key a set stores has to exist in the declaration, name a scope the
 * declaration offers, and carry a default, because a composite scope with no selection permits nothing.
 */
const declared = tickets.build();
const actionByName = new Map(
  declared.actions.map((action) => [action.name, action]),
);

/** The composite grants of one set, keyed by action name. */
function compositeGrants(grants: readonly PermissionGrant[]) {
  const byAction = new Map<
    string,
    { scopes: Record<string, string>; grant: PermissionGrant }
  >();
  for (const grant of grants) {
    if (
      grant.resource.type !== 'composite' ||
      grant.resource.id !== 'tickets'
    ) {
      continue;
    }
    for (const action of grant.actions) {
      const policy = action.policy as
        { type?: string; scopes?: Record<string, string> } | undefined;
      expect(policy?.type).toBe('composite');
      byAction.set(action.action, {
        scopes: policy?.scopes ?? {},
        grant,
      });
    }
  }
  return byAction;
}

describe('ticket permission sets', () => {
  it('declares every action the seed stores, with the scopes the declaration offers', () => {
    for (const set of ticketPermissionSets) {
      const grants = compositeGrants(set.grants);
      expect(grants.size).toBeGreaterThan(0);
      for (const [actionName, { scopes }] of grants) {
        const action = actionByName.get(actionName);
        expect(action).toBeDefined();
        const scopeByKey = new Map(
          (action?.dataScopes ?? []).map((scope) => [scope.key, scope]),
        );
        for (const [key, value] of Object.entries(scopes)) {
          const scope = scopeByKey.get(key);
          expect(scope).toBeDefined();
          expect(
            scope?.options ?? [],
            `${set.key} ${actionName} scope value ${value}`,
          ).toContain(value);
        }
      }
    }
  });

  it('gives every declared action a selection in at least one set, and every scope a default', () => {
    const stored = new Set<string>();
    for (const set of ticketPermissionSets) {
      for (const actionName of compositeGrants(set.grants).keys()) {
        stored.add(actionName);
      }
    }
    for (const action of declared.actions) {
      expect({
        action: action.name,
        assigned: stored.has(action.name),
      }).toEqual({
        action: action.name,
        assigned: true,
      });
      for (const scope of action.dataScopes ?? []) {
        // A scope with options but no default resolves to `NO_RECORD_ACCESS` for a set that does not select it, which
        // is a silent denial. The declaration always names one.
        expect(
          scope.defaultValue,
          `${action.name}.${scope.key} default`,
        ).toBeDefined();
        expect(scope.options ?? []).toContain(scope.defaultValue);
      }
    }
  });

  it('grants each job the pages its work needs, and nothing more', () => {
    const pagesOf = (key: string) => {
      const set = ticketPermissionSets.find(
        (candidate) => candidate.key === key,
      );
      expect(set?.key).toBe(key);
      return (set?.grants ?? [])
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id)
        .sort();
    };

    expect(pagesOf('employee')).toEqual([
      'tickets.detail',
      'tickets.list',
      'tickets.new',
    ]);
    expect(pagesOf('engineer')).toEqual(['tickets.detail', 'tickets.list']);
    expect(pagesOf('service-desk')).toEqual([
      'service-desk',
      'tickets.detail',
      'tickets.list',
      'tickets.new',
    ]);
  });

  it('separates the three jobs by verb and by record scope', () => {
    const scopesOf = (key: string, action: string) => {
      const set = ticketPermissionSets.find(
        (candidate) => candidate.key === key,
      );
      return compositeGrants(set?.grants ?? []).get(action)?.scopes;
    };

    // The employee reports and decides; it never assigns or handles.
    expect(scopesOf('employee', 'view')).toEqual({
      tickets: 'tickets.reportedByMe',
    });
    expect(scopesOf('employee', 'confirm')).toEqual({
      tickets: 'tickets.reportedByMe',
    });
    expect(scopesOf('employee', 'assign')).toBeUndefined();
    expect(scopesOf('employee', 'handle')).toBeUndefined();

    // The engineer handles only what is assigned to it, and cannot confirm or assign.
    expect(scopesOf('engineer', 'view')).toEqual({
      tickets: 'tickets.assignedToMe',
    });
    expect(scopesOf('engineer', 'handle')).toEqual({
      tickets: 'tickets.assignedToMe',
    });
    expect(scopesOf('engineer', 'assign')).toBeUndefined();
    expect(scopesOf('engineer', 'confirm')).toBeUndefined();

    // The service desk reaches every ticket and every verb.
    expect(scopesOf('service-desk', 'view')).toEqual({
      tickets: 'tickets.allTickets',
    });
    for (const action of [
      'assign',
      'handle',
      'confirm',
      'dashboard',
      'lifecycle',
    ]) {
      expect({ action, scopes: scopesOf('service-desk', action) }).toEqual({
        action,
        scopes: { tickets: 'tickets.allTickets' },
      });
    }
  });
});
