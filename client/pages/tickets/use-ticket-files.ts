import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useEffect, useMemo, useState } from 'react';

import { TICKET_ATTACHMENTS_REPOSITORY } from './use-ticket-attachments.js';

interface FilesState {
  readonly key: string;
  readonly files: readonly FileRecord[];
  readonly error?: Error;
}

/**
 * Reads the file records a ticket refers to, so the drawer can render thumbnails and previews. The file endpoint
 * decorates each row with a `contentUrl`; only the ids the ticket carries are requested.
 */
export function useTicketFiles(ids: readonly string[]): {
  readonly files: readonly FileRecord[];
  readonly loading: boolean;
  readonly error?: Error;
} {
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(TICKET_ATTACHMENTS_REPOSITORY),
    [manager],
  );
  // The ids serialized as one dependency, so a new array of the same ids does not refetch.
  const key = ids.join(',');
  const [state, setState] = useState<FilesState>({ key: '', files: [] });

  useEffect(() => {
    if (!key) return;
    let active = true;
    const list = key.split(',');
    repository
      .findMany({
        filter: (filter) =>
          filter.or(list.map((id) => filter.string('id').eq(id))),
      })
      .then(
        (files) => {
          if (active) setState({ key, files });
        },
        (error: unknown) => {
          if (active) {
            setState({
              key,
              files: [],
              error: error instanceof Error ? error : new Error(String(error)),
            });
          }
        },
      );
    return () => {
      active = false;
    };
  }, [repository, key]);

  const empty = key === '';
  const loading = !empty && state.key !== key;
  return {
    files: empty || loading ? [] : state.files,
    loading: !empty && loading,
    error: empty || loading ? undefined : state.error,
  };
}
