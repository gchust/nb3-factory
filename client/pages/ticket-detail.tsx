import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { ArrowLeft, Upload } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { AttachmentList } from '@/components/support/attachment-list';
import { PriorityBadge, StatusBadge } from '@/components/support/badges';
import { FileUploadField } from '@/components/support/file-upload-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ATTACHMENT_ACCEPT } from '@/lib/support-constants';
import {
  changeTicketStatus,
  downloadAttachment,
  fetchTicketDetail,
  formatDateTime,
  supportErrorKey,
  uploadAttachments,
  validateLocalFile,
  type AttachmentSummary,
  type TicketDetail,
  type TicketStatusAction,
} from '@/lib/support';

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const ticketId = Number(params.id);

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TicketStatusAction | null>(
    null,
  );
  const [files, setFiles] = useState<readonly File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const invalidId = !Number.isSafeInteger(ticketId) || ticketId <= 0;

  const stateError =
    location.state &&
    typeof location.state === 'object' &&
    'uploadError' in location.state &&
    typeof (location.state as { uploadError?: unknown }).uploadError ===
      'string'
      ? (location.state as { uploadError: string }).uploadError
      : null;

  const refresh = useCallback((): void => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTicketDetail(api, ticketId);
        if (cancelled) return;
        setDetail(data);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(supportErrorKey(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, invalidId, reloadToken, ticketId]);

  const handleUpload = async (): Promise<void> => {
    if (files.length === 0) return;
    for (const file of files) {
      const result = validateLocalFile(file);
      if (!result.ok) {
        setActionError(`support.errors.${result.code}`);
        return;
      }
    }
    setUploading(true);
    setActionError(null);
    try {
      await uploadAttachments(api, ticketId, files);
      setFiles([]);
      refresh();
    } catch (cause) {
      setActionError(supportErrorKey(cause));
    } finally {
      setUploading(false);
    }
  };

  const handleStatus = async (action: TicketStatusAction): Promise<void> => {
    setPendingAction(action);
    setActionError(null);
    try {
      await changeTicketStatus(api, ticketId, action);
      refresh();
    } catch (cause) {
      setActionError(supportErrorKey(cause));
    } finally {
      setPendingAction(null);
    }
  };

  const handleDownload = async (
    attachment: AttachmentSummary,
  ): Promise<void> => {
    setDownloadingId(attachment.id);
    setActionError(null);
    try {
      await downloadAttachment(api, attachment);
    } catch (cause) {
      setActionError(supportErrorKey(cause));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-8'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => void navigate('/tickets')}
      >
        <ArrowLeft aria-hidden='true' />
        {t('support.tickets.backToList')}
      </Button>

      {invalidId ? (
        <p className='text-sm text-destructive' role='alert'>
          {t('support.errors.NOT_FOUND')}
        </p>
      ) : loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('support.common.loading')}
        </p>
      ) : error || !detail ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(error ?? 'support.errors.NOT_FOUND')}
        </p>
      ) : (
        <>
          <header className='space-y-3 rounded-xl border border-border bg-card p-5'>
            <div className='flex flex-wrap items-center gap-3'>
              <h1 className='font-heading text-xl font-semibold tracking-tight'>
                {detail.ticket.number}
              </h1>
              <StatusBadge status={detail.ticket.status} />
              <PriorityBadge priority={detail.ticket.priority} />
            </div>
            <h2 className='text-lg font-medium'>{detail.ticket.title}</h2>
            {detail.ticket.description ? (
              <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                {detail.ticket.description}
              </p>
            ) : null}
            <dl className='grid grid-cols-1 gap-2 text-sm sm:grid-cols-2'>
              <div className='flex gap-2'>
                <dt className='text-muted-foreground'>
                  {t('support.fields.customer')}:
                </dt>
                <dd>
                  {detail.ticket.customerName ?? detail.ticket.customerId}
                </dd>
              </div>
              <div className='flex gap-2'>
                <dt className='text-muted-foreground'>
                  {t('support.fields.assignee')}:
                </dt>
                <dd>
                  {detail.ticket.assigneeName ?? t('support.fields.unassigned')}
                </dd>
              </div>
              <div className='flex gap-2'>
                <dt className='text-muted-foreground'>
                  {t('support.fields.createdAt')}:
                </dt>
                <dd>{formatDateTime(detail.ticket.createdAt)}</dd>
              </div>
            </dl>
            {detail.actions.length > 0 ? (
              <div className='flex flex-wrap gap-2 pt-1'>
                {detail.actions.map((action) => (
                  <Button
                    key={action}
                    type='button'
                    variant={action === 'confirm' ? 'default' : 'outline'}
                    size='sm'
                    disabled={pendingAction !== null}
                    onClick={() => void handleStatus(action)}
                  >
                    {t(`support.actions.${action}`)}
                  </Button>
                ))}
              </div>
            ) : null}
          </header>

          <section className='space-y-3'>
            <h2 className='font-heading text-lg font-medium'>
              {t('support.attachments.title')}
            </h2>
            <AttachmentList
              attachments={detail.attachments}
              downloadingId={downloadingId}
              onDownload={(attachment) => void handleDownload(attachment)}
            />
          </section>

          <section className='space-y-3 rounded-xl border border-border bg-card p-5'>
            <h2 className='font-heading text-lg font-medium'>
              {t('support.attachments.uploadTitle')}
            </h2>
            <div className='space-y-2'>
              <Label htmlFor='detail-attachments'>
                {t('support.fields.attachments')}
              </Label>
              <FileUploadField
                id='detail-attachments'
                label={t('support.attachments.choose')}
                accept={ATTACHMENT_ACCEPT}
                multiple
                value={files}
                onChange={setFiles}
                disabled={uploading}
              />
            </div>
            <Button
              type='button'
              disabled={uploading || files.length === 0}
              onClick={() => void handleUpload()}
            >
              <Upload aria-hidden='true' />
              {uploading
                ? t('support.attachments.uploading')
                : t('support.attachments.upload')}
            </Button>
          </section>
        </>
      )}

      {stateError ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(stateError)}
        </p>
      ) : null}
      {actionError ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(actionError)}
        </p>
      ) : null}
    </section>
  );
}
