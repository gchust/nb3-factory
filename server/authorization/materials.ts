import {
  defineCompositeResource,
  defineRecordAccess,
  type RecordAccessReference,
} from '@nocobase/authorization/core';
import {
  condition,
  defineDatabasePermission,
  recordAccess,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';

/** The application's own locale namespace; every authorization title resolves here. */
export const APP_NAMESPACE = 'nb3-factory';

function title(key: string): { key: string; ns: string } {
  return { key: `materials.permission.${key}`, ns: APP_NAMESPACE };
}

/** One material as the application maintains it: a title and a body. */
export interface MaterialRecord {
  id: number;
  title: string;
  body: string;
  restricted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * The records a colleague may read: everything the supervisor did not mark restricted. The supervisor holds the same
 * grant with `allRecords` instead, which is the only difference between the two permission sets.
 */
export const visibleMaterialsAccess = defineRecordAccess(
  'materials.visible',
  (access) =>
    access
      .title(title('visible'))
      .description(title('visibleDescription'))
      .collections('materials')
      .resolver(() =>
        // A boolean Field accepts `$isFalsy`, not `$eq`: db refuses `$eq` on a boolean at query time.
        condition('restricted', '$isFalsy'),
      ),
);

const visibleMaterials: RecordAccessReference<'materials.visible'> =
  visibleMaterialsAccess.reference();

/**
 * Reading one material. The allowlist is the whole public shape of the record, because a Policy node without a field
 * list reads as naming no field rather than every one.
 */
const materialsRead = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRecord>('materials')
    .title(title('read'))
    .read(['id', 'title', 'body', 'restricted', 'createdAt', 'updatedAt'])
    .options(recordAccess.allRecords, visibleMaterials)
    .default(recordAccess.allRecords),
);

/**
 * Maintaining a material. `restricted` is deliberately absent: visibility is a permission decision, so a page only
 * ever maintains the two content fields. `createdAt` and `updatedAt` are system-managed but writable, since nothing
 * else stamps them.
 */
const materialsWrite = defineDatabasePermission((permission) =>
  permission
    .collection<MaterialRecord>('materials')
    .title(title('write'))
    .create(['title', 'body', 'createdAt', 'updatedAt'])
    .update(['title', 'body', 'updatedAt'])
    .delete()
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords),
);

/**
 * The business resource the UI and the API share. `view` reads what the identity may see; `manage` maintains it, and
 * its write Policy is paired with `view`'s read Policy by the service, because db refuses a write whose Policy cannot
 * read the row back.
 */
export const materialsComposite = defineCompositeResource(
  'materials',
  (resource) =>
    resource
      .title(title('collection'))
      .action('view', (action) =>
        action.title(title('view')).grant('view', materialsRead),
      )
      .action('manage', (action) =>
        action.title(title('manage')).grant('manage', materialsWrite),
      ),
);

/** The permission workspace subsection the composite is listed under. */
export const materialsSection = {
  name: 'materials',
  title: title('section'),
  parent: 'business',
} as const;

/**
 * Declares the collection, the record access and the composite against a running authorization. Called from a service
 * provider's `boot()`, so registration happens once, after the plugins that own these registries have booted.
 */
export function registerMaterialsAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'materials',
    title: title('collection'),
    actions: ['read', 'create', 'update', 'delete'],
  });
  authz.recordAccess.define(visibleMaterialsAccess);
  authz.ui.sections.add(materialsSection);
  const reference = authz.compositeResources.define(materialsComposite);
  authz.ui.place(reference, { section: materialsSection.name });
}
