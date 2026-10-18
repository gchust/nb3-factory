import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
} from '@nocobase/app-plugin-file/client';
import { useMemo, useState } from 'react';

import type { FileUploadStatus } from '#extensions/nocobase-file-component-ui/types';

/** The file exposure `server/routes/service-desk/file-routes.ts` declares for ticket screenshots. */
export const TICKET_ATTACHMENTS_REPOSITORY = 'ticketAttachments';

/**
 * The upload repository for ticket screenshots and the live status of an upload, so the form can refuse to submit
 * while a file is still going up.
 */
export function useTicketAttachments(): {
  readonly repository: ClientFileRepository;
  readonly status: FileUploadStatus;
  readonly onStatusChange: (status: FileUploadStatus) => void;
} {
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(TICKET_ATTACHMENTS_REPOSITORY),
    [manager],
  );
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  return { repository, status, onStatusChange: setStatus };
}
