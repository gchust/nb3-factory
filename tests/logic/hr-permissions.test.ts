// @vitest-environment node
/**
 * The permission model is the security boundary of the HR feature: an extra
 * action in the employee set, or a missing one in the supervisor set, is a
 * visible defect and a data leak. These assertions pin each set to the exact
 * capability the requirement gives it, and pin the composite's action
 * vocabulary so a route and a grant cannot drift apart silently.
 */
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { describe, expect, it } from 'vitest';

import {
  EMPLOYEE_SET_KEY,
  HR_ACTION,
  HR_PAGE_IDS,
  HR_RESOURCE,
  HR_SET_KEY,
  hrPortal,
  hrPortalDefinition,
  SUPERVISOR_SET_KEY,
  defineHrPermissionSets,
} from '../../server/hr/resources.ts';

/** `defineHrPermissionSets` only asks the authorization for page grants. */
const stubAuthz = {
  pages: {
    grant: (id: string) => ({
      resource: { type: 'page', id },
      actions: [{ action: 'access' }],
    }),
  },
} as unknown as AppAuthorization;

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

function sets() {
  return defineHrPermissionSets(stubAuthz);
}

function compositeActions(set: { grants: readonly unknown[] }): string[] {
  const grant = (set.grants as readonly Grant[]).find(
    (entry) => entry.resource.type === 'composite',
  );
  if (!grant) return [];
  return grant.actions.map((entry) => entry.action).sort();
}

function pageIds(set: { grants: readonly unknown[] }): string[] {
  return (set.grants as readonly Grant[])
    .filter((entry) => entry.resource.type === 'page')
    .map((entry) => entry.resource.id)
    .sort();
}

describe('HR permission sets', () => {
  it('provisions exactly the HR, supervisor and employee sets', () => {
    expect(sets().map((set) => set.key)).toEqual([
      HR_SET_KEY,
      SUPERVISOR_SET_KEY,
      EMPLOYEE_SET_KEY,
    ]);
  });

  it('grants HR every action and every page', () => {
    const hr = sets().find((set) => set.key === HR_SET_KEY)!;
    expect(compositeActions(hr)).toEqual(Object.values(HR_ACTION).sort());
    expect(pageIds(hr)).toEqual(Object.values(HR_PAGE_IDS).sort());
  });

  it('gives the supervisor department, leave and basic-employee access only', () => {
    const supervisor = sets().find((set) => set.key === SUPERVISOR_SET_KEY)!;
    expect(compositeActions(supervisor)).toEqual(
      [
        HR_ACTION.viewEmployees,
        HR_ACTION.viewDepartments,
        HR_ACTION.viewLeave,
        HR_ACTION.applyLeave,
        HR_ACTION.decideLeave,
      ].sort(),
    );
    // The confidential block, and the right to change people or departments,
    // stay with HR.
    for (const forbidden of [
      HR_ACTION.viewEmployeeConfidential,
      HR_ACTION.manageEmployees,
      HR_ACTION.manageDepartments,
    ]) {
      expect(compositeActions(supervisor)).not.toContain(forbidden);
    }
  });

  it('gives the employee self-service without any review right', () => {
    const employee = sets().find((set) => set.key === EMPLOYEE_SET_KEY)!;
    expect(compositeActions(employee)).toEqual(
      [
        HR_ACTION.viewDepartments,
        HR_ACTION.viewLeave,
        HR_ACTION.applyLeave,
      ].sort(),
    );
    expect(compositeActions(employee)).not.toContain(HR_ACTION.decideLeave);
    expect(compositeActions(employee)).not.toContain(HR_ACTION.viewEmployees);
  });

  it('declares each composite action once, with a grant', () => {
    const definition = hrPortalDefinition.build();
    expect(definition.name).toBe(HR_RESOURCE.id);
    expect(definition.actions.map((action) => action.name)).toEqual(
      Object.values(HR_ACTION),
    );
    for (const action of definition.actions) {
      expect(action.grants.length).toBeGreaterThan(0);
    }
    expect(hrPortal.name).toBe(HR_RESOURCE.id);
  });
});
