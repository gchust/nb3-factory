import {
  defineAuthorizationResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  type AppAuthorizationService,
} from '@nocobase/app-plugin-authorization';
import type { FilterNode } from '@nocobase/db';

/**
 * The library's authorization surface. One collection, one composed business
 * resource, the record-access policies the rules point at, and the page
 * resource. All of it is registered into the application's existing
 * Authorization service, so the server — not the page — decides access.
 */

export interface MaterialRow {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const MATERIALS_COLLECTION = 'materials';
/** The composed business resource the rules, permission sets and page name. */
export const MATERIAL_RESOURCE_ID = 'library.materials';
/** One scope key per resource action; every rule must reuse this key. */
export const MATERIAL_SCOPE_KEY = 'materials';

export const MATERIAL_RESOURCE = {
  type: 'resource',
  id: MATERIAL_RESOURCE_ID,
} as const;

export const MATERIALS_COLLECTION_REF = {
  type: 'database.collection',
  id: MATERIALS_COLLECTION,
} as const;

/** Named record-access policies the seeded rules reference by key. */
export const PUBLIC_MATERIALS_POLICY = 'library.public';
export const NON_CONFIDENTIAL_MATERIALS_POLICY = 'library.nonConfidential';

/** Every field the library reads or writes through the API. */
const READ_FIELDS = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const UPDATE_FIELDS = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const;

// A view permission is read-only. A write permission repeats the read base,
// because a repository write returns the row it wrote.
const materialRead = defineDatabasePermission<MaterialRow, string>(
  (permission) =>
    permission
      .collection<MaterialRow>(MATERIALS_COLLECTION)
      .read([...READ_FIELDS]),
);
const materialCreate = defineDatabasePermission<MaterialRow, string>(
  (permission) =>
    permission
      .collection<MaterialRow>(MATERIALS_COLLECTION)
      .read([...READ_FIELDS])
      .create([...READ_FIELDS]),
);
const materialEdit = defineDatabasePermission<MaterialRow, string>(
  (permission) =>
    permission
      .collection<MaterialRow>(MATERIALS_COLLECTION)
      .read([...READ_FIELDS])
      .update([...UPDATE_FIELDS]),
);
const materialDelete = defineDatabasePermission<MaterialRow, string>(
  (permission) =>
    // Read is part of the delete grant so the list route can prove, with the
    // same Policy the delete endpoint enforces, whether a row is inside the
    // delete scope. The write itself is still decided by the `delete` node.
    permission
      .collection<MaterialRow>(MATERIALS_COLLECTION)
      .read([...READ_FIELDS])
      .delete(),
);

export const materialResource = defineAuthorizationResource(
  MATERIAL_RESOURCE_ID,
  (resource) =>
    resource
      .group('library')
      .title('Materials')
      .action('view', (action) =>
        action.grant(MATERIAL_SCOPE_KEY, materialRead),
      )
      .action('create', (action) =>
        action.grant(MATERIAL_SCOPE_KEY, materialCreate),
      )
      .action('edit', (action) =>
        action.grant(MATERIAL_SCOPE_KEY, materialEdit),
      )
      .action('delete', (action) =>
        action.grant(MATERIAL_SCOPE_KEY, materialDelete),
      ),
);

/** Published and not confidential: the by-default readable subset. */
export function publicMaterialsScope(): FilterNode {
  return {
    kind: 'group',
    logic: 'and',
    items: [
      condition('published', '$isTruly'),
      condition('confidential', '$isFalsy'),
    ],
  };
}

/** Not confidential: the restriction applied to the reader account. */
export function nonConfidentialMaterialsScope(): FilterNode {
  return condition('confidential', '$isFalsy');
}

const publicMaterials = defineRecordAccess(PUBLIC_MATERIALS_POLICY, (access) =>
  access
    .title('Published materials')
    .description('Materials that are published and not confidential')
    .resources(MATERIALS_COLLECTION_REF)
    .resolve(() => publicMaterialsScope()),
);

const nonConfidentialMaterials = defineRecordAccess(
  NON_CONFIDENTIAL_MATERIALS_POLICY,
  (access) =>
    access
      .title('Non-confidential materials')
      .description('Materials that are not marked confidential')
      .resources(MATERIALS_COLLECTION_REF)
      .resolve(() => nonConfidentialMaterialsScope()),
);

/**
 * Registers the library into the running Authorization service. Called once
 * from the application provider's `start`, after migrations and seeds.
 */
export function registerLibraryAuthorization(
  authz: AppAuthorizationService,
): void {
  authz.resourceGroups.add({
    name: 'library',
    title: 'Library',
    category: 'business',
  });
  authz.db.collections.add({
    name: MATERIALS_COLLECTION,
    title: 'Materials',
  });
  authz.recordAccess.add(publicMaterials);
  authz.recordAccess.add(nonConfidentialMaterials);
  materialResource.register(authz.resources);
  authz.pages.add({
    name: MATERIAL_RESOURCE_ID,
    title: 'Library materials',
    actions: ['access'],
  });
}
