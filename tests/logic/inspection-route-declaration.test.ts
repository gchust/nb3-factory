import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';
import { INSPECTION_PAGE_NAMES } from '../../server/providers/inspection-roles.js';

interface RouteDefinition {
  readonly name: string;
  readonly path?: string;
  readonly auth?: string;
  readonly navigation?: { readonly title: string };
  readonly componentLoader?: () => Promise<unknown>;
  readonly children?: readonly RouteDefinition[];
}

interface AppRouteContribution {
  readonly parent: string;
  readonly routes: readonly RouteDefinition[];
}

const appContribution = routes.find(
  (contribution) => 'parent' in contribution && contribution.parent === 'app',
) as unknown as AppRouteContribution | undefined;

function inspectionGroup(): RouteDefinition {
  const group = appContribution?.routes.find(
    (route) => route.name === 'inspection',
  );
  if (!group)
    throw new Error('The inspection navigation group is not declared.');
  return group;
}

describe('inspection route declarations', () => {
  it('declares the application route contribution', () => {
    expect(appContribution?.parent).toBe('app');
  });

  it('groups the inspection pages under a navigation group', () => {
    expect(inspectionGroup().navigation?.title).toBe('navigation.inspection');
    expect(inspectionGroup().componentLoader).toBeUndefined();
  });

  it('declares every inspection page with required auth', () => {
    const children = inspectionGroup().children ?? [];
    const byName = new Map(children.map((child) => [child.name, child]));

    expect([...byName.keys()].sort()).toEqual(
      [
        'inspectionAbnormal',
        'inspectionDevices',
        'inspectionPlans',
        'inspectionRecordDetail',
        'inspectionRecordNew',
        'inspectionRecords',
        'inspectionStatistics',
      ].sort(),
    );
    for (const child of children) {
      expect(child.auth).toBe('required');
      expect(typeof child.componentLoader).toBe('function');
    }
  });

  it('keeps the create and detail routes out of the sidebar', () => {
    const children = inspectionGroup().children ?? [];
    const newRoute = children.find(
      (child) => child.name === 'inspectionRecordNew',
    );
    const detailRoute = children.find(
      (child) => child.name === 'inspectionRecordDetail',
    );
    expect(newRoute?.path).toBe('/inspection/records/new');
    expect(newRoute?.navigation).toBeUndefined();
    expect(detailRoute?.path).toBe('/inspection/records/:recordId');
    expect(detailRoute?.navigation).toBeUndefined();
  });

  it('puts the readable pages in the sidebar', () => {
    const children = inspectionGroup().children ?? [];
    const titled = Object.fromEntries(
      children
        .filter((child) => child.navigation !== undefined)
        .map((child) => [child.name, child.navigation?.title]),
    );
    expect(titled).toMatchObject({
      inspectionRecords: 'navigation.inspectionRecords',
      inspectionAbnormal: 'navigation.inspectionAbnormal',
      inspectionStatistics: 'navigation.inspectionStatistics',
      inspectionDevices: 'navigation.inspectionDevices',
      inspectionPlans: 'navigation.inspectionPlans',
    });
  });

  it('grants a page for every declared inspection route', () => {
    // A `required` page route with no explicit access is checked against a
    // `page:<route name>` grant. A route name missing from the grant list would
    // load fine for an administrator and be "Access denied" for everyone else,
    // so the two lists have to agree.
    const declared = (inspectionGroup().children ?? [])
      .map((child) => child.name)
      .sort();
    expect(Object.values(INSPECTION_PAGE_NAMES).sort()).toEqual(declared);
  });
});
