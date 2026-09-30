import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import { errorMessage, formatBytes } from '../service-api.js';
import { useServiceApi, useServicePermission } from '../service-hooks.js';
import type { ServiceAttachment } from '../types.js';
import { AttachmentPreviewDialog } from './attachment-preview-dialog.js';
import { canPreviewAttachment } from './attachment-preview.js';
import { openAttachment } from './open-attachment.js';
import { SectionTitle } from './service-states.js';

/**
 * The PNG/DOCX attachments of one ticket or one manual. Upload and removal are
 * offered only to a caller the composite action allows; every read goes through
 * the authenticated client so the session cookie travels with the request.
 */
export function AttachmentPanel({
  owner,
  resourceId,
  action = 'manage',
  title,
  emptyText,
  canEdit = true,
  attachments,
  onChanged,
}: {
  readonly owner: { readonly kind: 'ticket' | 'manual'; readonly id: number };
  readonly resourceId: string;
  readonly action?: string;
  readonly title: string;
  readonly emptyText: string;
  readonly canEdit?: boolean;
  readonly attachments: readonly ServiceAttachment[];
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ServiceAttachment | null>(null);
  const [previewing, setPreviewing] = useState<ServiceAttachment | null>(null);
  const permitted = useServicePermission(resourceId, action);
  const canWrite = canEdit && permitted;
  // Ticket evidence stays a PNG/DOCX matrix; a manual additionally accepts a
  // Markdown document so a written procedure can be maintained in the app.
  const accept =
    owner.kind === 'manual'
      ? '.png,.docx,.md,image/png,text/markdown'
      : '.png,.docx,image/png';

  const upload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setBusy(true);
      try {
        await api.uploadAttachment({
          file,
          category: owner.kind === 'ticket' ? 'evidence' : 'manual',
          ...(owner.kind === 'ticket'
            ? { ticketId: owner.id }
            : { manualId: owner.id }),
        });
        toaster.show({
          type: 'success',
          title: t('service.attachments.uploaded'),
        });
        onChanged();
      } catch (error) {
        toaster.show({
          type: 'error',
          title: t('service.attachments.uploadFailed'),
          description: errorMessage(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [api, onChanged, owner, t, toaster],
  );

  const remove = useCallback(async () => {
    if (!removing) return;
    try {
      await api.deleteAttachment(removing.id);
      toaster.show({
        type: 'success',
        title: t('service.attachments.removed'),
      });
      setRemoving(null);
      onChanged();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.attachments.removeFailed'),
        description: errorMessage(error),
      });
    }
  }, [api, onChanged, removing, t, toaster]);

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <SectionTitle>{title}</SectionTitle>
        {canWrite ? (
          <>
            <input
              ref={fileInputRef}
              type='file'
              accept={accept}
              className='hidden'
              onChange={(event) => void upload(event)}
            />
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              {t('service.attachments.upload')}
            </Button>
          </>
        ) : null}
      </div>

      {canWrite && owner.kind === 'manual' ? (
        <p className='text-xs text-muted-foreground'>
          {t('service.manuals.markdownHint')}
        </p>
      ) : null}

      {attachments.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{emptyText}</p>
      ) : (
        <ul className='flex flex-col gap-2'>
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className='flex flex-wrap items-center gap-3 rounded-lg border p-3'
            >
              <span className='flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'>
                {attachment.mimeType === 'image/png' ? (
                  <EyeIcon className='size-4' />
                ) : (
                  <FileTextIcon className='size-4' />
                )}
              </span>
              <div className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-sm'>{attachment.filename}</span>
                <span className='text-xs text-muted-foreground'>
                  {formatBytes(attachment.size)} · {attachment.mimeType}
                </span>
              </div>
              <div className='flex items-center gap-1'>
                {canPreviewAttachment(attachment) ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setPreviewing(attachment)}
                  >
                    <EyeIcon />
                    {t('service.attachments.preview')}
                  </Button>
                ) : null}
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    void openAttachment(api, attachment, 'download', toaster, t)
                  }
                >
                  <DownloadIcon />
                  {t('service.attachments.download')}
                </Button>
                {canWrite ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive'
                    onClick={() => setRemoving(attachment)}
                  >
                    <Trash2Icon />
                    {t('service.attachments.remove')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AttachmentPreviewDialog
        api={api}
        attachment={previewing}
        open={previewing !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.attachments.removeTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.attachments.removeDescription', {
                name: removing?.filename ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void remove()}
            >
              {t('service.attachments.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
