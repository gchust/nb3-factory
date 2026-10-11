import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import {
  APP_LOCALE_NAMESPACE,
  documents,
} from '../../server/documents-resources.ts';

const title = (key: string) => ({ key, ns: APP_LOCALE_NAMESPACE });

/**
 * The job permission sets the document library ships with. These are values, not registrations: the seed under
 * `database/main/seeds/` persists them once, and an administrator may edit them afterwards without the application
 * overwriting the change on the next start.
 *
 * `documents-editor` maintains the documents it owns; `documents-reader` may only read what `documents.readable`
 * selects. Neither set can edit another person's document, and read access never implies write access.
 */
export const documentsEditor = definePermissionSet('documents-editor')
  .title(title('documents.permissionSets.editor'))
  .grant({
    resource: { type: 'page', id: 'documents' },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.reference().grant({
      view: { documents: 'documents.readable' },
      create: { documents: 'allRecords' },
      edit: { documents: 'recordsIOwn' },
      delete: { documents: 'recordsIOwn' },
    }),
  )
  .build();

export const documentsReader = definePermissionSet('documents-reader')
  .title(title('documents.permissionSets.reader'))
  .grant({
    resource: { type: 'page', id: 'documents' },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.reference().grant({
      view: { documents: 'documents.readable' },
    }),
  )
  .build();
