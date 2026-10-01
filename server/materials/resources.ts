import {
  defineCompositeResource,
  defineRecordAccess,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type AppAuthorization,
  type PermissionSetsApi,
} from '@nocobase/app-plugin-authorization/server';

import { MATERIALS_COLLECTION } from './constants.ts';

export { DATABASE_CONNECTION, MATERIALS_COLLECTION } from './constants.ts';
export const MATERIALS_DIRECTORY = 'materials.directory';
export const MATERIALS_STAFF_SET = 'materials-staff';
export const MATERIALS_MANAGER_SET = 'materials-manager';

export const MATERIALS_NAMESPACE = 'nb3-factory';

/** Page identities. They must match `client/routes.ts` and the page grants. */
export const MATERIALS_PAGES = {
  read: 'materials',
  manage: 'materials-admin',
  assistant: 'materials-assistant',
} as const;

export interface Material {
  id: number;
  title: string;
  content: string;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Writes a page `access` grant without an Authorization instance. */
export function pageAccessGrant(id: string): PermissionGrant {
  return { resource: { type: 'page', id }, actions: [{ action: 'access' }] };
}

/** A record access that keeps confidential materials out of every query. */
export const visibleMaterialsRecordAccess = defineRecordAccess(
  'materials.visible',
  (access) =>
    access
      .title({
        key: 'materials.recordAccess.visible.title',
        ns: MATERIALS_NAMESPACE,
      })
      .description({
        key: 'materials.recordAccess.visible.description',
        ns: MATERIALS_NAMESPACE,
      })
      .collections(MATERIALS_COLLECTION)
      // Boolean columns accept only the truthy/falsy operators, not `$eq`.
      .resolver(() => condition('confidential', '$isFalsy')),
);

export const visibleMaterials = visibleMaterialsRecordAccess.reference();

/**
 * Read-only access to visible materials. The field list deliberately excludes
 * `confidential`, so even the read policy cannot reveal the flag.
 */
function materialViewPermission() {
  return defineDatabasePermission((permission) =>
    permission
      .collection<Material>(MATERIALS_COLLECTION)
      .title({ key: 'materials.permission.view', ns: MATERIALS_NAMESPACE })
      .options(recordAccess.allRecords, visibleMaterials)
      .default(visibleMaterials)
      .read(['id', 'title', 'content', 'createdAt', 'updatedAt']),
  );
}

/** Full maintenance access, reserved for the supervisor permission set. */
function materialManagePermission() {
  return defineDatabasePermission((permission) =>
    permission
      .collection<Material>(MATERIALS_COLLECTION)
      .title({ key: 'materials.permission.manage', ns: MATERIALS_NAMESPACE })
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read('*')
      .create('*')
      // `update('*')` resolves to every field, including the generated primary
      // key, which the Repository's write policy rejects as non-writable. Name
      // the editable columns instead.
      .update(['title', 'content', 'updatedAt'])
      .delete(),
  );
}

const materialsDirectoryBuilder = defineCompositeResource(
  MATERIALS_DIRECTORY,
  (resource) =>
    resource
      .title({ key: 'materials.resource.title', ns: MATERIALS_NAMESPACE })
      .action('view', (action) =>
        action
          .title({ key: 'materials.action.view', ns: MATERIALS_NAMESPACE })
          .grant('records', materialViewPermission(), {
            title: { key: 'materials.scope.records', ns: MATERIALS_NAMESPACE },
          }),
      )
      .action('manage', (action) =>
        action
          .title({ key: 'materials.action.manage', ns: MATERIALS_NAMESPACE })
          .grant('records', materialManagePermission(), {
            title: { key: 'materials.scope.records', ns: MATERIALS_NAMESPACE },
          }),
      ),
);

export const materialsDirectory = materialsDirectoryBuilder.reference();

/**
 * Registers the collection, the visible record access, the composite resource
 * and the workspace placement. Safe to call once per boot: re-registering the
 * same collection with the same actions is a no-op.
 */
export function registerMaterialsResources(authz: AppAuthorization): void {
  authz.recordAccess.define(visibleMaterialsRecordAccess);
  authz.database.collections.add({
    name: MATERIALS_COLLECTION,
    title: { key: 'materials.resource.title', ns: MATERIALS_NAMESPACE },
    description: {
      key: 'materials.resource.description',
      ns: MATERIALS_NAMESPACE,
    },
  });
  authz.ui.groups.add({
    name: 'materials',
    title: { key: 'materials.group.title', ns: MATERIALS_NAMESPACE },
  });
  authz.compositeResources.define(materialsDirectoryBuilder);
  authz.ui.place(materialsDirectory, {
    section: authz.ui.sections.other('business'),
    group: 'materials',
  });
}

/** Assigns a permission set to a user identity through the public API. */
export async function assignPermissionSet(
  permissionSets: PermissionSetsApi,
  permissionSet: string,
  userId: string,
): Promise<void> {
  await permissionSets.assign({
    subject: { type: 'user', id: userId },
    permissionSet,
  });
}
