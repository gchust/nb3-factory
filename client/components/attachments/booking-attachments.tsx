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
import { useApiData } from '@/lib/use-api-data';
import {
  IMAGE_ACCEPT,
  MAX_ATTACH_BYTES,
  MAX_ATTACH_FILES,
  PDF_ACCEPT,
  addBookingAttachments,
  listBookingAttachments,
  removeBookingAttachment,
  type Attachment,
  type BookingAttachmentKind,
} from '@/lib/rentals';

import { AttachmentUploader } from './attachment-uploader.js';
import { attachmentIdOf, toFileRecords } from './files.js';

interface GroupDefinition {
  readonly kind: BookingAttachmentKind;
  readonly title: string;
  readonly multiple: boolean;
  readonly accept?: readonly string[];
}

export interface BookingAttachmentsProps {
  readonly bookingId: number;
  /** Whether the caller may add or remove attachments right now. */
  readonly canModify: boolean;
  /** Settled rentals keep their handover records read-only. */
  readonly readOnly: boolean;
}

/**
 * The file material of one rental: the agreement and its supplements, plus the
 * site photos and acceptance PDF of delivery and of return, kept as distinct
 * groups so a delivery photo is never confused with a return one.
 */
export function BookingAttachments({
  bookingId,
  canModify,
  readOnly,
}: BookingAttachmentsProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('rentalFiles'),
    [manager],
  );
  const [error, setError] = useState<unknown>(null);

  const attachments = useApiData<readonly Attachment[]>(
    `booking-attachments:${bookingId}`,
    (client) => listBookingAttachments(client, bookingId),
  );

  const groups: readonly GroupDefinition[] = [
    {
      kind: 'agreement',
      title: t('rentals.attachments.agreement'),
      multiple: true,
    },
    {
      kind: 'supplement',
      title: t('rentals.attachments.supplement'),
      multiple: true,
    },
    {
      kind: 'deliveryPhoto',
      title: t('rentals.attachments.deliveryPhoto'),
      multiple: true,
      accept: IMAGE_ACCEPT,
    },
    {
      kind: 'deliveryPdf',
      title: t('rentals.attachments.deliveryPdf'),
      multiple: true,
      accept: PDF_ACCEPT,
    },
    {
      kind: 'returnPhoto',
      title: t('rentals.attachments.returnPhoto'),
      multiple: true,
      accept: IMAGE_ACCEPT,
    },
    {
      kind: 'returnPdf',
      title: t('rentals.attachments.returnPdf'),
      multiple: true,
      accept: PDF_ACCEPT,
    },
  ];

  async function link(
    kind: BookingAttachmentKind,
    fileIds: readonly string[],
  ): Promise<void> {
    setError(null);
    await addBookingAttachments(api, bookingId, kind, fileIds);
    attachments.reload();
  }

  async function remove(attachmentId: number): Promise<void> {
    setError(null);
    try {
      await removeBookingAttachment(api, bookingId, attachmentId);
      attachments.reload();
    } catch (cause: unknown) {
      setError(cause);
    }
  }

  function renderGroup(group: GroupDefinition): ReactElement {
    const files = toFileRecords(
      (attachments.data ?? []).filter(
        (attachment) => attachment.kind === group.kind,
      ),
    );
    const groupLabel = group.title;
    return (
      <div className='space-y-2' key={group.kind}>
        <h3 className='text-sm font-medium'>{groupLabel}</h3>
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
            canModify
              ? (file: FileRecord) => remove(attachmentIdOf(file))
              : undefined
          }
        />
        {canModify ? (
          <AttachmentUploader
            accept={group.accept}
            maxFiles={MAX_ATTACH_FILES}
            maxSize={MAX_ATTACH_BYTES}
            multiple={group.multiple}
            onFiles={(fileIds) => link(group.kind, fileIds)}
            onError={(cause) => setError(cause)}
            repository={repository}
          />
        ) : null}
      </div>
    );
  }

  const byKind = (kind: BookingAttachmentKind): GroupDefinition =>
    groups.find((group) => group.kind === kind) as GroupDefinition;

  return (
    <section className='rounded-xl border border-border bg-card p-4'>
      <h2 className='font-heading text-base font-medium'>
        {t('rentals.attachments.title')}
      </h2>
      <p className='mt-1 text-xs text-muted-foreground'>
        {t('rentals.attachments.description')}
      </p>
      {readOnly ? (
        <p className='mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
          {t('rentals.attachments.readOnly')}
        </p>
      ) : null}
      <RentalErrorMessage error={error} />
      <QueryState
        emptyDescription={t('rentals.attachments.description')}
        emptyTitle={t('rentals.attachments.empty')}
        error={attachments.error}
        loading={attachments.loading}
        onRetry={attachments.reload}
      >
        <div className='mt-4 space-y-5'>
          {renderGroup(byKind('agreement'))}
          {renderGroup(byKind('supplement'))}

          <div className='space-y-4 rounded-lg border border-border p-3'>
            <h3 className='text-sm font-semibold'>
              {t('rentals.attachments.deliveryGroup')}
            </h3>
            {renderGroup(byKind('deliveryPhoto'))}
            {renderGroup(byKind('deliveryPdf'))}
          </div>

          <div className='space-y-4 rounded-lg border border-border p-3'>
            <h3 className='text-sm font-semibold'>
              {t('rentals.attachments.returnGroup')}
            </h3>
            {renderGroup(byKind('returnPhoto'))}
            {renderGroup(byKind('returnPdf'))}
          </div>
        </div>
      </QueryState>
    </section>
  );
}
