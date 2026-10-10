import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useMemo } from 'react';

/**
 * The composite resource the library declares on the server. It is a stable
 * contract: it identifies the resource in grants, so it must match
 * `LIBRARY_RESOURCE_ID` in `server/library-resources.ts`.
 */
export const LIBRARY_RESOURCE_ID = 'library.documents';

/**
 * Which of the four library actions the signed-in user is currently permitted.
 * The server enforces the same grant on every endpoint; this only decides what
 * the page offers, so a button that appears is not a permission.
 */
export function useLibraryPermissions(): {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
} {
  const resource = useMemo(
    () => ({ id: LIBRARY_RESOURCE_ID, type: 'composite' }) as const,
    [],
  );
  const view = useCan({ action: 'view', resource });
  const create = useCan({ action: 'create', resource });
  const edit = useCan({ action: 'edit', resource });
  const remove = useCan({ action: 'delete', resource });
  return {
    canView: view.can,
    canCreate: create.can,
    canEdit: edit.can,
    canDelete: remove.can,
  };
}
