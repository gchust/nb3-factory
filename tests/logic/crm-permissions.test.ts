import { describe, expect, it } from 'vitest';

import {
  CRM_PAGE_ROUTES,
  salesManagerGrants,
  salesRepGrants,
} from '../../database/main/seeds/202609130002_seed_crm_permissions.js';

const CRM_COLLECTIONS = [
  'main.crmCustomers',
  'main.crmContacts',
  'main.crmOpportunities',
  'main.crmFollowUps',
  'main.crmAttachments',
] as const;

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: { readonly recordAccess?: readonly string[] };
  }[];
}

function recordAccessFor(
  grants: readonly Grant[],
  collection: string,
  action: string,
): readonly string[] | undefined {
  const grant = grants.find(
    (item) =>
      item.resource.type === 'database.collection' &&
      item.resource.id === collection,
  );
  return grant?.actions.find((item) => item.action === action)?.policy
    ?.recordAccess;
}

describe('CRM permission grants', () => {
  it.each([
    ['sales representative', salesRepGrants, 'recordsIOwn'],
    ['sales manager', salesManagerGrants, 'allRecords'],
  ] as const)('lets a %s open every CRM page', (_name, build, _scope) => {
    // Without a `page`/`access` grant the client route guard denies the page and
    // hides the menu entry, even when the database grants are correct.
    const grants = build() as readonly Grant[];
    for (const page of CRM_PAGE_ROUTES) {
      const grant = grants.find(
        (item) => item.resource.type === 'page' && item.resource.id === page,
      );
      expect(grant, `missing page grant for ${page}`).toBeDefined();
      expect(grant?.actions).toContainEqual({ action: 'access' });
    }
  });

  it.each([
    ['sales representative', salesRepGrants],
    ['sales manager', salesManagerGrants],
  ] as const)('grants a %s every CRM action', (_name, build) => {
    const grants = build() as readonly Grant[];
    for (const collection of CRM_COLLECTIONS) {
      const grant = grants.find(
        (item) =>
          item.resource.type === 'database.collection' &&
          item.resource.id === collection,
      );
      expect(grant, `missing collection grant for ${collection}`).toBeDefined();
      expect(grant?.actions.map((item) => item.action).sort()).toEqual([
        'create',
        'delete',
        'read',
        'update',
      ]);
    }
  });

  it('scopes sales representative reads to records they own', () => {
    expect(
      recordAccessFor(
        salesRepGrants() as readonly Grant[],
        'main.crmCustomers',
        'read',
      ),
    ).toEqual(['recordsIOwn']);
  });

  it('scopes sales manager reads to all records', () => {
    expect(
      recordAccessFor(
        salesManagerGrants() as readonly Grant[],
        'main.crmCustomers',
        'read',
      ),
    ).toEqual(['allRecords']);
  });
});
