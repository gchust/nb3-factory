import { useTranslation } from '@nocobase/i18n/client';
import { Eye } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { FileViewerDialog } from '@/components/file-viewer/file-viewer-dialog';
import { useFileViewer } from '@/components/file-viewer/use-file-viewer';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AcceptanceItem, DeliveryVersion } from '@/lib/delivery-api';
import { rawErrorMessage, useDeliveryErrorMessage } from '@/lib/delivery-error';
import { formatBytes, formatDateTime } from '@/lib/format';
import { versionStatusLabel } from '@/lib/status-labels';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

export default function AcceptancePage(): ReactElement {
  const { t } = useTranslation();
  const state = useResource((client) => client.acceptanceQueue());
  const [searchParams, setSearchParams] = useSearchParams();
  const viewer = useFileViewer();
  // The URL is the source of truth for which version is being reviewed, so the
  // dashboard's link can open it directly and closing never needs local state.
  const requestedVersion = Number(searchParams.get('version'));
  const active: AcceptanceItem | undefined = requestedVersion
    ? state.data?.find((item) => item.versionId === requestedVersion)
    : undefined;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.acceptance.title')}
        description={t('delivery.acceptance.description')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('delivery.acceptance.queue')}</CardTitle>
          <CardDescription>
            {t('delivery.acceptance.queueHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {state.loading ? <Loading /> : null}
          {state.error ? (
            <div className='space-y-2'>
              <p className='text-sm text-destructive'>{state.error}</p>
              <Button onClick={state.reload}>
                {t('delivery.common.retry')}
              </Button>
            </div>
          ) : null}
          {state.data && !state.loading ? (
            state.data.length ? (
              state.data.map((item) => (
                <div
                  key={item.versionId}
                  className='flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3'
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {item.contractNo} · {item.deliverableName} V
                      {item.versionNo}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {item.milestoneName} · {item.submittedByName} ·{' '}
                      {formatDateTime(item.submittedAt)} ·{' '}
                      {t('delivery.acceptance.acceptor')}:{' '}
                      {item.acceptorName || '—'}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <StatusBadge kind='version' status='pending_review' />
                    <Button
                      size='sm'
                      onClick={() =>
                        setSearchParams({ version: String(item.versionId) })
                      }
                    >
                      {t('delivery.acceptance.open')}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.acceptance.empty')}
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <ReviewDialog
        key={active ? String(active.versionId) : 'closed'}
        item={active}
        onClose={() => setSearchParams({})}
        onReviewed={() => {
          setSearchParams({});
          state.reload();
        }}
        onPreview={(files, index) => viewer.show(files, index)}
      />

      <FileViewerDialog
        files={viewer.files}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(open) => (open ? undefined : viewer.hide())}
      />
    </PageContainer>
  );
}

function ReviewDialog({
  item,
  onClose,
  onReviewed,
  onPreview,
}: {
  readonly item: AcceptanceItem | undefined;
  readonly onClose: () => void;
  readonly onReviewed: () => void;
  readonly onPreview: (files: DeliveryVersion['files'], index: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const errorMessage = useDeliveryErrorMessage();
  const api = useDeliveryApi();
  const [versions, setVersions] = useState<readonly DeliveryVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | undefined>(
    item?.versionId,
  );
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    void api
      .versions(item.taskId)
      .then((rows) => {
        if (cancelled) return;
        setVersions(rows);
        setSelectedId(item.versionId);
        setComment('');
        setError(undefined);
      })
      .catch((cause: unknown) => setError(rawErrorMessage(cause)));
    return () => {
      cancelled = true;
    };
  }, [api, item]);

  const selected =
    versions.find((version) => version.id === selectedId) ?? versions[0];

  const act = async (kind: 'approve' | 'return'): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      if (kind === 'approve') await api.approveVersion(selected.id, comment);
      else await api.returnVersion(selected.id, comment);
      onReviewed();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('delivery.acceptance.review')}</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.contractNo} · ${item.milestoneName} · ${item.deliverableName}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          <Label>{t('delivery.acceptance.versions')}</Label>
          <div className='flex flex-wrap gap-2'>
            {versions.map((version) => (
              <Button
                key={version.id}
                size='sm'
                variant={version.id === selected?.id ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedId(version.id);
                  setComment('');
                }}
              >
                V{version.versionNo}
                <span className='ml-1 text-xs opacity-80'>
                  {versionStatusLabel(t, version.status)}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {selected ? (
          <div className='space-y-2 rounded-md border border-border p-3 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>V{selected.versionNo}</span>
              <StatusBadge kind='version' status={selected.status} />
              <span className='text-muted-foreground'>
                {selected.submittedByName} ·{' '}
                {formatDateTime(selected.submittedAt)}
              </span>
            </div>
            {selected.note ? <p>{selected.note}</p> : null}
            {selected.reviewComment ? (
              <p className='text-muted-foreground'>
                {t('delivery.acceptance.comment')}: {selected.reviewComment}
              </p>
            ) : null}
            <ul className='space-y-1'>
              {selected.files.map((file, index) => (
                <li key={file.id} className='flex items-center gap-2'>
                  <span className='truncate'>{file.filename}</span>
                  <span className='text-xs text-muted-foreground'>
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => onPreview(selected.files, index)}
                  >
                    <Eye aria-hidden='true' /> {t('delivery.files.preview')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className='space-y-2'>
          <Label htmlFor='acceptance-comment'>
            {t('delivery.acceptance.comment')}
          </Label>
          <Textarea
            id='acceptance-comment'
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <p className='text-xs text-muted-foreground'>
            {t('delivery.acceptance.returnHint')}
          </p>
        </div>

        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            variant='outline'
            disabled={busy || !comment.trim() || !selected?.canAccept}
            onClick={() => void act('return')}
          >
            {t('delivery.acceptance.return')}
          </Button>
          <Button
            disabled={busy || !selected?.canAccept}
            onClick={() => void act('approve')}
          >
            {t('delivery.acceptance.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
