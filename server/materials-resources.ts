import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/** The locale namespace the application registers its own wording under. */
const NS = 'nb3-factory';

/** A material row as the database resolves it. */
export interface MaterialRow {
  id: number;
  title: string;
  body: string;
  confidential: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Records a regular colleague may see: everything that is not confidential.
 * `$isFalsy` covers both `false` and a stored `NULL`, so a record written
 * before the flag existed still counts as public.
 *
 * Registered by the owning provider with `authz.recordAccess.define`.
 */
export const materialsPublicAccess = defineRecordAccess(
  'materials.public',
  (access) =>
    access
      .title({ key: 'materials.recordAccess.public', ns: NS })
      .collections('materials')
      .resolver(() => condition('confidential', '$isFalsy')),
);

/**
 * Reading a material. Both record selections are offered and the least
 * privileged one is the default, so a grant that names no scope reads only
 * public material.
 */
const materialsRead = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRow>('materials')
    .title({ key: 'materials.data', ns: NS })
    .options(recordAccess.allRecords, materialsPublicAccess.reference())
    .default(materialsPublicAccess.reference())
    .read(['id', 'title', 'body', 'confidential', 'createdAt', 'updatedAt']),
);

/**
 * Creating, editing and removing a material. Only `title`, `body` and the two
 * audit timestamps are writable: the `confidential` flag stays under
 * application control so an operator cannot expose a restricted record by
 * accident, and the timestamps are supplied by the route rather than the
 * client. Only all-records access is offered.
 *
 * The read fields are declared here too because a write returns the row it
 * touched: the Repository re-reads the record under the same policy, so a
 * `manage` grant that could not read would fail on the way back. Reading a
 * record you may edit is part of managing it.
 */
const materialsWrite = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRow>('materials')
    .title({ key: 'materials.data', ns: NS })
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read(['id', 'title', 'body', 'confidential', 'createdAt', 'updatedAt'])
    .create(['title', 'body', 'createdAt', 'updatedAt'])
    .update(['title', 'body', 'updatedAt'])
    .delete(),
);

/**
 * The business operation a route and a permission set refer to. `view` governs
 * reading a material, `manage` governs creating, editing and removing one.
 * Record visibility is chosen per grant through the `materials` data scope.
 */
export const materialsLibrary = defineCompositeResource(
  'materials.library',
  (resource) =>
    resource
      .title({ key: 'materials.resource.title', ns: NS })
      .action('view', (action) =>
        action
          .title({ key: 'materials.action.view', ns: NS })
          .grant('materials', materialsRead, {
            title: { key: 'materials.data', ns: NS },
          }),
      )
      .action('manage', (action) =>
        action
          .title({ key: 'materials.action.manage', ns: NS })
          .grant('materials', materialsWrite, {
            title: { key: 'materials.data', ns: NS },
          }),
      ),
);
