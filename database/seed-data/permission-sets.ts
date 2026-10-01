import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  LIBRARY_NAMESPACE,
  MATERIALS_PAGE,
  MATERIALS_SCOPE,
  materials,
  RECORD_ACCESS_OWNED,
  RECORD_ACCESS_PUBLISHED,
} from '../../server/library/resources.ts';

/**
 * The two job permission sets the material library ships with, as portable values. This module only builds
 * definitions; the installation seed persists them and an administrator can edit them afterwards from the
 * authorization workspace.
 */

const title = (key: string) => ({ key, ns: LIBRARY_NAMESPACE });

const pageGrant = {
  resource: { type: 'page', id: MATERIALS_PAGE } as const,
  actions: [{ action: 'access' }],
};

/** 资料员: maintains their own materials and may create, edit and delete them. */
export const librarian = definePermissionSet('library-librarian')
  .title(title('library.role.librarian'))
  .grant(pageGrant)
  .grant(
    materials.reference().grant({
      view: { [MATERIALS_SCOPE]: RECORD_ACCESS_OWNED },
      create: { [MATERIALS_SCOPE]: RECORD_ACCESS_OWNED },
      edit: { [MATERIALS_SCOPE]: RECORD_ACCESS_OWNED },
      delete: { [MATERIALS_SCOPE]: RECORD_ACCESS_OWNED },
    }),
  )
  .build();

/** 阅读者: reads published, non-confidential materials and nothing else. */
export const reader = definePermissionSet('library-reader')
  .title(title('library.role.reader'))
  .grant(pageGrant)
  .grant(
    materials.reference().grant({
      view: { [MATERIALS_SCOPE]: RECORD_ACCESS_PUBLISHED },
    }),
  )
  .build();
