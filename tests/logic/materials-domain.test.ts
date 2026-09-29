// @vitest-environment node

import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import { materialsSeed } from '../../database/main/seeds/202609290002_materials.js';
import { materialsPermissionSets } from '../../database/seed-data/materials-permission-sets.js';
import {
  MATERIALS_COLLECTION,
  MATERIAL_FIELDS,
  toMaterialDto,
  type MaterialRecord,
} from '../../server/materials/constants.js';
import {
  MATERIALS_PAGES,
  visibleMaterialsRecordAccess,
  visibleMaterials,
} from '../../server/materials/resources.js';

describe('materials seed', () => {
  it('carries the three specified materials, C confidential', () => {
    const byTitle = new Map(materialsSeed.map((item) => [item.title, item]));
    expect(materialsSeed).toHaveLength(3);
    expect(byTitle.get('报修联系方式')).toMatchObject({
      content: '蓝鹭设备报修电话为 400-000-7316',
      confidential: false,
    });
    expect(byTitle.get('巡检周期')).toMatchObject({
      content: '蓝鹭设备常规巡检间隔为 45 天',
      confidential: false,
    });
    // The supervisor-only record: the flag is what the record access reads.
    expect(byTitle.get('保密项目内部代号')).toMatchObject({
      content: '保密项目的内部代号为墨竹 729',
      confidential: true,
    });
  });
});

describe('materials DTO', () => {
  const record: MaterialRecord = {
    id: 7,
    title: 'title',
    content: 'body',
    confidential: false,
    createdAt: new Date('2026-01-02T03:04:05Z'),
    updatedAt: '2026-01-03T00:00:00Z',
  };

  it('maps the read fields and ISO timestamps', () => {
    expect(toMaterialDto(record)).toEqual({
      id: 7,
      title: 'title',
      content: 'body',
      confidential: false,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(MATERIAL_FIELDS).toEqual([
      'id',
      'title',
      'content',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('omits confidential when the read policy did not select it', () => {
    const { confidential, ...withoutFlag } = record;
    void confidential;
    expect(toMaterialDto(withoutFlag)).not.toHaveProperty('confidential');
  });
});

describe('visible materials record access', () => {
  it('applies to the logical collection and keeps only truthy-false rows', async () => {
    const definition = visibleMaterialsRecordAccess.build();
    expect(definition.key).toBe('materials.visible');
    expect(definition.collections).toEqual([MATERIALS_COLLECTION]);
    expect(MATERIALS_COLLECTION).toBe('materials');
    expect(visibleMaterials.key).toBe('materials.visible');

    // Boolean columns accept `$isFalsy`; `$eq` is rejected by db, which would
    // turn every colleague read into a server error instead of a filter.
    expect(
      definition.resolve({
        principal: { type: 'user', id: '1' },
        collection: MATERIALS_COLLECTION,
        action: 'read',
        params: {},
      }),
    ).toMatchObject({
      kind: 'condition',
      path: ['confidential'],
      operator: '$isFalsy',
    });
  });
});

describe('materials permission sets', () => {
  const manager = materialsPermissionSets.find(
    (set) => set.key === 'materials-manager',
  );
  const staff = materialsPermissionSets.find(
    (set) => set.key === 'materials-staff',
  );

  it('defines a manager and a staff set', () => {
    expect(manager).toBeDefined();
    expect(staff).toBeDefined();
  });

  it('gives the manager every page and both composite actions on all records', () => {
    expect(pageIds(manager!)).toEqual([
      MATERIALS_PAGES.read,
      MATERIALS_PAGES.manage,
      MATERIALS_PAGES.assistant,
    ]);
    expect(scopeOf(manager!, 'view')).toBe('allRecords');
    expect(scopeOf(manager!, 'manage')).toBe('allRecords');
  });

  it('gives staff the read and assistant pages, view only, and no manage', () => {
    expect(pageIds(staff!)).toEqual([
      MATERIALS_PAGES.read,
      MATERIALS_PAGES.assistant,
    ]);
    expect(scopeOf(staff!, 'view')).toBe('materials.visible');
    expect(scopeOf(staff!, 'manage')).toBeUndefined();
  });
});

describe('materials page identities', () => {
  it('names page grants that match the registered routes', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        routes: applicationRoutes,
        source: 'application',
      },
    ]);
    const pageRoutes = resolved.routes.filter(
      (route) =>
        typeof route.authz === 'object' && route.authz.resource.type === 'page',
    );
    const byName = new Map(
      pageRoutes.map((route) => [
        route.name,
        route.authz as { resource: { id: string } },
      ]),
    );
    for (const id of Object.values(MATERIALS_PAGES)) {
      const route = byName.get(id);
      expect(route, `route named ${id}`).toBeDefined();
      expect(route!.resource.id).toBe(id);
    }
  });
});

function pageIds(set: { grants: readonly PermissionGrantLike[] }): string[] {
  return set.grants
    .filter((grant) => grant.resource.type === 'page')
    .map((grant) => grant.resource.id)
    .sort();
}

function scopeOf(
  set: { grants: readonly PermissionGrantLike[] },
  action: string,
): string | undefined {
  const composite = set.grants.find(
    (grant) => grant.resource.type === 'composite',
  );
  const grantAction = composite?.actions.find((item) => item.action === action);
  const scopes = grantAction?.policy?.['scopes'] as
    Record<string, unknown> | undefined;
  return scopes?.['records'] as string | undefined;
}

interface PermissionGrantLike {
  resource: { type: string; id: string };
  actions: readonly { action: string; policy?: Record<string, unknown> }[];
}
