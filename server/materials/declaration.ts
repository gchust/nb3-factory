import {
  condition,
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

/**
 * The application's i18n namespace. A namespace is a package name, so this is
 * the application's own package name; the client and server locale files
 * register the keys below under it.
 */
export const MATERIALS_NAMESPACE = 'nb3-factory';

/** The authorization workspace subsection the materials resource is listed under. */
export const MATERIALS_SECTION = 'materials';

/** The business Collection the assistant and the reading page are built on. */
export const MATERIALS_COLLECTION = 'materials';

/** The composite resource a signed-in reader checks before any read or edit. */
export const MATERIALS_RESOURCE = 'internalMaterials';

/** Every column a permitted reader may select. */
export const MATERIALS_READ_FIELDS = [
  'id',
  'title',
  'body',
  'confidential',
  'createdAt',
] as const;

/** The only columns an editor may change: the content, never the access flag. */
export const MATERIALS_WRITE_FIELDS = ['title', 'body'] as const;

/**
 * A record-access rule a colleague's grant selects with. It narrows the
 * material to the ones filed as not confidential, which is exactly what the
 * reading page shows them; the assistant reads through the same rule, so
 * nothing the page cannot show can be answered from.
 */
export const materialsViewable = defineRecordAccess(
  'materials.viewable',
  (access) =>
    access
      .title({ key: 'recordAccess.viewable', ns: MATERIALS_NAMESPACE })
      .description({
        key: 'recordAccess.viewableDescription',
        ns: MATERIALS_NAMESPACE,
      })
      .collections(MATERIALS_COLLECTION)
      .resolver(() => condition('confidential', '$isFalsy')),
);

/**
 * The read permission behind the composite `view` action. A grant bound to
 * `materials` chooses either every record (a supervisor) or the viewable rule
 * (a colleague); the two choices are the two permissions the seeds carry.
 */
const materialsReadPermission = defineDatabasePermission((permission) =>
  permission
    .collection(MATERIALS_COLLECTION)
    .read([...MATERIALS_READ_FIELDS])
    .options(recordAccess.allRecords, materialsViewable.reference()),
);

/**
 * The read-and-write permission behind the composite `edit` action. Editing a
 * material also shows it, but only `title` and `body` may change, so a caller
 * cannot promote a material to confidential or hide one from a colleague.
 */
const materialsEditPermission = defineDatabasePermission((permission) =>
  permission
    .collection(MATERIALS_COLLECTION)
    .read([...MATERIALS_READ_FIELDS])
    .update([...MATERIALS_WRITE_FIELDS])
    .options(recordAccess.allRecords, materialsViewable.reference()),
);

/**
 * The composite resource the reading page, the assistant tool and the
 * generated Repository endpoints all authorize against. `view` reads the
 * materials a caller may see; `edit` additionally allows changing a material's
 * content. Each action has exactly one data scope, one Collection, which is
 * what lets `authz.database.authorizeRepository` bind it to the endpoints.
 */
export const materialsCompositeResource = defineCompositeResource(
  MATERIALS_RESOURCE,
  (resource) =>
    resource
      .title({ key: 'composite.title', ns: MATERIALS_NAMESPACE })
      .action('view', (action) =>
        action
          .title({ key: 'composite.view', ns: MATERIALS_NAMESPACE })
          .grant(MATERIALS_COLLECTION, materialsReadPermission, {
            title: { key: 'composite.view', ns: MATERIALS_NAMESPACE },
          }),
      )
      .action('edit', (action) =>
        action
          .title({ key: 'composite.edit', ns: MATERIALS_NAMESPACE })
          .grant(MATERIALS_COLLECTION, materialsEditPermission, {
            title: { key: 'composite.edit', ns: MATERIALS_NAMESPACE },
          }),
      ),
);

/** The reference the Repository authorization middleware binds to. */
export const materialsResource = materialsCompositeResource.reference();

/**
 * A grant that lets a colleague read only the viewable materials.
 *
 * The two permission sets the seeds install build their composite grant from
 * this and from `materialsSupervisorViewGrant`, so seed data and the composite
 * definition cannot drift apart.
 */
export const materialsColleagueViewGrant = materialsResource.grant({
  view: { [MATERIALS_COLLECTION]: materialsViewable.reference().key },
});

/** A grant that lets a supervisor read every material. */
export const materialsSupervisorViewGrant = materialsResource.grant({
  view: { [MATERIALS_COLLECTION]: recordAccess.allRecords.key },
});

/** A grant that lets a supervisor read and edit every material. */
export const materialsSupervisorEditGrant = materialsResource.grant({
  edit: {
    [MATERIALS_COLLECTION]: recordAccess.allRecords.key,
  },
});

/** A page `access` grant, matching what `authz.pages.grant(id)` writes. */
export function materialsPageGrant(pageId: string) {
  return {
    resource: { type: 'page' as const, id: pageId },
    actions: [{ action: 'access' }],
  };
}
