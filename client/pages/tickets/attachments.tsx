import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { Loading } from '#components/loading';
import { RequestFailed } from '#components/request-failed';
import {
  FilePreviewField,
  clientFileRepositoryManagerToken,
} from '#extensions/nocobase-file-component-ui/index';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/index';
import { useApiResource } from '#hooks/service-desk';

/**
 * A ticket's attachments, read-only.
 *
 * The ticket stores the selected file ids; the files themselves live in the `ticketAttachments` collection, so the
 * page resolves the ids to records to get the `contentUrl` each thumbnail and preview needs. Reading goes through the
 * file plugin's repository, which the application's own middleware protects on the server.
 */
export function TicketAttachments({
  ids,
}: {
  readonly ids: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('ticketAttachments'),
    [manager],
  );
  // The ids are the request's key: the same set reuses the records already loaded, a different set loads again.
  const key = ids.join(',');
  const files = useApiResource<readonly FileRecord[]>(
    key === '' ? '' : `ticket-files:${key}`,
    async () =>
      await repository.findMany({
        // The filter builder has no `in`, so one equality per id, combined with `or`.
        filter: (filter) =>
          filter.or(ids.map((id) => filter.string('id').eq(id))),
        limit: ids.length,
      }),
  );

  if (files.error) {
    return (
      <RequestFailed
        error={files.error}
        title={t('serviceDesk.detail.attachmentsFailed')}
        description={t('serviceDesk.error.requestFailed')}
        onRetry={files.reload}
      />
    );
  }
  if (files.data === undefined) return <Loading />;

  // The repository returns rows in its own order; keep the order the requester attached them in.
  const order = new Map(ids.map((id, index) => [id, index]));
  const rows = [...files.data].sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
  return (
    <FilePreviewField
      files={rows}
      showFilenames
      labels={{
        preview: t('serviceDesk.detail.previewFile'),
        download: t('serviceDesk.detail.downloadFile'),
      }}
    />
  );
}
