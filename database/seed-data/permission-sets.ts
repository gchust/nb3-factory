import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { libraryDocuments } from '../../server/library-resources.ts';

const title = (key: string) => ({ key, ns: 'app' });

const documents = libraryDocuments.reference();

const own = 'recordsIOwn';
const visible = 'library.visible';

const librarian = definePermissionSet('library.librarian')
  .title(title('library.permissionSets.librarian'))
  .grant({
    resource: { type: 'page', id: 'library.librarian' },
    actions: [{ action: 'access' }],
  })
  // Librarians browse the same published catalogue as readers as well as managing their own documents.
  .grant({
    resource: { type: 'page', id: 'library.reader' },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.grant({
      view: { documents: visible },
      create: { documents: own },
      edit: { documents: own },
      delete: { documents: own },
    }),
  )
  .build();

const reader = definePermissionSet('library.reader')
  .title(title('library.permissionSets.reader'))
  .grant({
    resource: { type: 'page', id: 'library.reader' },
    actions: [{ action: 'access' }],
  })
  .grant(
    documents.grant({
      view: { documents: visible },
    }),
  )
  .build();

/**
 * The two library jobs. The administrator keeps the template's root set, which bypasses per-resource authorization
 * and therefore needs no library grant. Administrators can edit these sets and their assignments after installation.
 */
export const LIBRARY_PERMISSION_SETS = [librarian, reader] as const;
