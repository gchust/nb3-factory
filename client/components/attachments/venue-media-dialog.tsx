import { useApiClient, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import {
  FileList,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { QueryState } from '@/components/query-state';
import { RentalErrorMessage } from '@/components/rental-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApiData } from '@/lib/use-api-data';
import {
  IMAGE_ACCEPT,
  MAX_ATTACH_BYTES,
  MAX_ATTACH_FILES,
  addVenueAttachments,
  listVenueAttachments,
  removeVenueAttachment,
  type Attachment,
  type Venue,
  type VenueAttachmentKind,
} from '@/lib/rentals';

import { AttachmentUploader } from './attachment-uploader.js';
import { attachmentIdOf, toFileRecords } from './files.js';

export interface VenueMediaDialogProps {
  readonly venue: Venue;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly canManage: boolean;
}

/** Cover and gallery images of one venue: preview always, edit for managers. */
export function VenueMediaDialog({
  venue,
  open,
  onOpenChange,
  canManage,
}: VenueMediaDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('rentalFiles'),
    [manager],
  );
  const [error, setError] = useState<unknown>(null);

  const attachments = useApiData<readonly Attachment[]>(
    `venue-attachments:${venue.id}`,
    (client) => listVenueAttachments(client, venue.id),
  );

  async function link(
    kind: VenueAttachmentKind,
    fileIds: readonly string[],
  ): Promise<void> {
    setError(null);
    await addVenueAttachments(api, venue.id, kind, fileIds);
    attachments.reload();
  }

  async function remove(attachmentId: number): Promise<void> {
    setError(null);
    try {
      await removeVenueAttachment(api, venue.id, attachmentId);
      attachments.reload();
    } catch (cause: unknown) {
      setError(cause);
    }
  }

  function renderGroup(
    kind: VenueAttachmentKind,
    title: string,
    multiple: boolean,
  ): ReactElement {
    const files = toFileRecords(
      (attachments.data ?? []).filter((item) => item.kind === kind),
    );
    return (
      <div className='space-y-2' key={kind}>
        <h3 className='text-sm font-medium'>{title}</h3>
        <FileList
          emptyState={
            <p className='text-xs text-muted-foreground'>
              {t('rentals.attachments.groupEmpty')}
            </p>
          }
          files={files}
          labels={{
            preview: t('rentals.attachments.preview'),
            download: t('rentals.attachments.download'),
            remove: t('rentals.attachments.remove'),
          }}
          onError={(cause) => setError(cause)}
          onRemove={
            canManage
              ? (file: FileRecord) => remove(attachmentIdOf(file))
              : undefined
          }
        />
        {canManage ? (
          <AttachmentUploader
            accept={IMAGE_ACCEPT}
            maxFiles={multiple ? MAX_ATTACH_FILES : 1}
            maxSize={MAX_ATTACH_BYTES}
            multiple={multiple}
            onError={(cause) => setError(cause)}
            onFiles={(fileIds) => link(kind, fileIds)}
            repository={repository}
          />
        ) : null}
      </div>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-h-[calc(100vh-2rem)] max-w-3xl overflow-auto'>
        <DialogHeader>
          <DialogTitle>
            {t('rentals.attachments.venueTitle', { name: venue.name })}
          </DialogTitle>
          <DialogDescription>
            {t('rentals.attachments.venueDescription')}
          </DialogDescription>
        </DialogHeader>
        <RentalErrorMessage error={error} />
        <QueryState
          emptyDescription={t('rentals.attachments.venueDescription')}
          emptyTitle={t('rentals.attachments.empty')}
          error={attachments.error}
          loading={attachments.loading}
          onRetry={attachments.reload}
        >
          <div className='space-y-5'>
            {renderGroup('cover', t('rentals.attachments.cover'), false)}
            {renderGroup('gallery', t('rentals.attachments.gallery'), true)}
          </div>
        </QueryState>
        <Button
          onClick={() => onOpenChange(false)}
          type='button'
          variant='outline'
        >
          {t('actions.close')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
