import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import { defineCompositeResource } from '@nocobase/authorization/core';

/**
 * The `materials` collection as the authorization model sees it.
 *
 * The application only ever edits `title` and `body`; `confidential` is the one
 * flag the record-level rule reads. `id` is part of every read so the client can
 * address a row, and it is deliberately absent from the writable field lists —
 * it is an auto-increment column no write may set.
 */
export interface Material {
  id: string | number;
  title: string;
  body: string;
  confidential: boolean;
}

export const MATERIALS_COLLECTION = 'materials';
export const MATERIALS_RESOURCE_ID = 'app.materials';

const READ_FIELDS = ['id', 'title', 'body', 'confidential'] as const;
// A material carries only a title and a body; `confidential` is set by the
// seed that ships the restricted material and is never writable through the
// API, so no request can widen or narrow who may read a row.
const WRITE_FIELDS = ['title', 'body'] as const;

/** Read fields of the collection. */
const materialData = defineDatabasePermission((permission) =>
  permission
    .collection<Material>(MATERIALS_COLLECTION)
    .title('Materials')
    .read([...READ_FIELDS]),
);

/**
 * The single business resource behind the materials page and the assistant.
 *
 * Each action carries exactly one data scope, bound to the `materials`
 * collection, and its grant includes the CRUD operation the matching Repository
 * method performs. `authz.database.authorizeRepository` narrows the generated
 * Repository policy with the caller's decision for that action, so a reader
 * only ever receives rows the chosen record access selects.
 */
export const materialsResource = defineCompositeResource(
  MATERIALS_RESOURCE_ID,
  (resource) =>
    resource
      .title('Materials')
      .action('view', (action) =>
        action.title('View').grant(MATERIALS_COLLECTION, materialData),
      )
      .action('create', (action) =>
        action
          .title('Create')
          .grant(MATERIALS_COLLECTION, materialData.create([...WRITE_FIELDS])),
      )
      .action('edit', (action) =>
        action
          .title('Edit')
          .grant(MATERIALS_COLLECTION, materialData.update([...WRITE_FIELDS])),
      )
      .action('delete', (action) =>
        action
          .title('Delete')
          .grant(MATERIALS_COLLECTION, materialData.delete()),
      ),
);
