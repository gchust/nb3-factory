import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { publicMaterials } from './record-access.ts';

/** A row of the `materials` table. */
export interface MaterialRow {
  id: number;
  title: string;
  body: string;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MaterialVisibility = 'public' | 'supervisor';

/**
 * The database permission behind the composite's `read` action: the fields a
 * reader may see. Its record access choices are `allRecords` (supervisor) and
 * the public-only scope a colleague holds.
 */
export const materialRead = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRow>('materials')
    .title('资料')
    .read(['id', 'title', 'body', 'visibility', 'createdAt', 'updatedAt'])
    .options(recordAccess.allRecords, publicMaterials.reference())
    .default(publicMaterials.reference()),
);

/**
 * The database permission behind the composite's `manage` action: the
 * supervisor-only fields that may be edited. Managing materials always covers
 * every record, so only `allRecords` is offered.
 */
export const materialManage = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRow>('materials')
    .title('资料维护')
    // `updatedAt` is written by the server on every edit, so the grant must
    // include it or the repository refuses the update.
    .update(['title', 'body', 'visibility', 'updatedAt'])
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/**
 * The `materials` composite. `read` expands to a public-or-all read of the
 * materials table; `manage` expands to a supervisor-only update. A permission
 * set selects one of the data scopes the read action declares.
 */
export const materials = defineCompositeResource('materials', (resource) =>
  resource
    .title('资料')
    .action('read', (action) =>
      action
        .title('查看资料')
        .grant('materials', materialRead, { title: '可查看的资料' }),
    )
    .action('manage', (action) =>
      action
        .title('维护资料')
        .grant('materials', materialManage, { title: '可维护的资料' }),
    ),
);

/**
 * Registers the collection and its record access with the application's
 * Authorization. Called once from the materials provider's `register()`.
 * Without this the collection is unknown to Authorization and every check is
 * denied, including for the unrestricted identity.
 */
export function registerMaterialsResources(
  authz: import('@nocobase/app-plugin-authorization/server').AppAuthorization,
): void {
  authz.recordAccess.define(publicMaterials);
  const reference = authz.compositeResources.define(materials);
  // List the composite in the permission workspace so it is not reported as an
  // unplaced resource at startup. Display only; it grants nothing.
  authz.ui.sections.add({
    name: 'materials',
    title: '资料',
    parent: 'business',
  });
  authz.ui.place(reference, { section: 'materials' });
  authz.database.collections.add({
    name: 'materials',
    title: '资料',
    description: '业务资料库，按可见范围控制读取',
  });
}
