import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, Share2Icon, XIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { CollaboratorPicker } from './collaborator-picker.js';
import { DeliverableFileActions } from './file-view.js';
import { formatDateTime } from './format.js';
import { DeliverableStatusBadge, EmptyHint } from './ui.js';
import type { Deliverable } from './types.js';

/** The owner's rejection reason. The API requires a non-empty reason, so the dialog blocks an empty one. */
function RejectDialog({
  deliverable,
  open,
  onOpenChange,
  onSaved,
}: {
  readonly deliverable: Deliverable;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(): Promise<void> {
    if (!reason.trim()) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await api.request({
        path: `deliverables/${encodeURIComponent(deliverable.id)}/reject`,
        method: 'POST',
        json: { reason: reason.trim() },
      });
      toaster.show({
        type: 'success',
        title: t('projects.deliverables.rejected'),
      });
      setReason('');
      onOpenChange(false);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('projects.deliverables.reject')}</DialogTitle>
          <DialogDescription>
            {t('projects.deliverables.rejectHint')}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('projects.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={!reason.trim()}>
          <FieldLabel htmlFor='reject-reason'>
            {t('projects.deliverables.rejectReason')}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
          </FieldLabel>
          <Textarea
            aria-invalid={!reason.trim()}
            aria-required='true'
            id='reject-reason'
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button
            disabled={submitting}
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={submitting || !reason.trim()}
            type='button'
            variant='destructive'
            onClick={() => void submit()}
          >
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {t('projects.deliverables.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shares one deliverable with named colleagues and revokes a share again. Only the submitter and the project owner
 * can open it (`canSubmitterShare`); the endpoint enforces that independently.
 */
function ShareDialog({
  deliverable,
  open,
  onOpenChange,
  onSaved,
}: {
  readonly deliverable: Deliverable;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sharedIds = new Set(
    deliverable.shares.map((share) => share.sharedWithId),
  );

  async function addShare(): Promise<void> {
    if (!pendingId) return;
    setBusy(true);
    try {
      await api.request({
        path: `deliverables/${encodeURIComponent(deliverable.id)}/shares`,
        method: 'POST',
        // The API field is `userId`; `sharedWithId` is only the response name.
        json: { userId: pendingId },
      });
      toaster.show({ type: 'success', title: t('projects.shares.added') });
      setPendingId(null);
      onSaved();
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError &&
          error.reason === 'DELIVERABLE_SHARE_EXISTS'
            ? t('projects.shares.exists')
            : t('projects.error.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(shareId: string): Promise<void> {
    setBusy(true);
    try {
      await api.request({
        path: `deliverables/${encodeURIComponent(deliverable.id)}/shares/${encodeURIComponent(shareId)}`,
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('projects.shares.revoked') });
      onSaved();
    } catch {
      toaster.show({
        type: 'error',
        title: t('projects.error.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('projects.shares.title')}</DialogTitle>
          <DialogDescription>{t('projects.shares.hint')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          {deliverable.shares.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('projects.shares.none')}
            </p>
          ) : (
            deliverable.shares.map((share) => (
              <div
                key={share.id}
                className='flex items-center justify-between gap-3 rounded-lg border p-2 text-sm'
              >
                <span className='truncate'>
                  {share.sharedWithName ??
                    share.sharedWithEmail ??
                    share.sharedWithId}
                </span>
                <Button
                  disabled={busy}
                  size='sm'
                  type='button'
                  variant='ghost'
                  onClick={() => void removeShare(share.id)}
                >
                  <XIcon data-icon='inline-start' />
                  {t('projects.shares.revoke')}
                </Button>
              </div>
            ))
          )}
        </div>
        <Field>
          <FieldLabel>{t('projects.shares.with')}</FieldLabel>
          <CollaboratorPicker
            excludeIds={[...sharedIds]}
            placeholder={t('projects.shares.pick')}
            value={pendingId}
            onValueChange={setPendingId}
          />
        </Field>
        <DialogFooter>
          <Button
            disabled={busy}
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.close')}
          </Button>
          <Button
            disabled={busy || !pendingId}
            type='button'
            onClick={() => void addShare()}
          >
            {busy ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <Share2Icon data-icon='inline-start' />
            )}
            {t('projects.shares.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One deliverable: what was submitted, its file, its review state, and the actions the viewer may take. */
export function DeliverableCard({
  deliverable,
  onChanged,
}: {
  readonly deliverable: Deliverable;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [accepting, setAccepting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  async function accept(): Promise<void> {
    setAccepting(true);
    try {
      await api.request({
        path: `deliverables/${encodeURIComponent(deliverable.id)}/accept`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t('projects.deliverables.accepted'),
      });
      onChanged();
    } catch {
      toaster.show({
        type: 'error',
        title: t('projects.error.requestFailed'),
      });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>{deliverable.title}</span>
            <DeliverableStatusBadge status={deliverable.status} />
            {deliverable.shares.length > 0 ? (
              <Badge variant='outline'>
                {t('projects.shares.count', {
                  count: deliverable.shares.length,
                })}
              </Badge>
            ) : null}
          </div>
          <p className='text-sm text-muted-foreground'>
            {t('projects.deliverables.meta', {
              submitter: deliverable.submitterName ?? deliverable.submitterId,
              date: formatDateTime(deliverable.createdAt),
            })}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {deliverable.canReview ? (
            <>
              <Button
                disabled={accepting}
                size='sm'
                type='button'
                onClick={() => void accept()}
              >
                {accepting ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <CheckIcon data-icon='inline-start' />
                )}
                {t('projects.deliverables.accept')}
              </Button>
              <Button
                size='sm'
                type='button'
                variant='outline'
                onClick={() => setRejectOpen(true)}
              >
                <XIcon data-icon='inline-start' />
                {t('projects.deliverables.reject')}
              </Button>
            </>
          ) : null}
          {deliverable.canSubmitterShare ? (
            <Button
              size='sm'
              type='button'
              variant='outline'
              onClick={() => setShareOpen(true)}
            >
              <Share2Icon data-icon='inline-start' />
              {t('projects.shares.manage')}
            </Button>
          ) : null}
        </div>
      </div>
      {deliverable.description ? (
        <p className='text-sm whitespace-pre-wrap'>{deliverable.description}</p>
      ) : null}
      {deliverable.rejectReason ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('projects.deliverables.rejectReasonLabel', {
              reason: deliverable.rejectReason,
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      <DeliverableFileActions
        deliverableId={deliverable.id}
        fileName={deliverable.fileName}
        fileSize={deliverable.fileSize}
        mimeType={deliverable.fileMimeType}
      />
      <RejectDialog
        deliverable={deliverable}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onSaved={onChanged}
      />
      <ShareDialog
        deliverable={deliverable}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onSaved={onChanged}
      />
    </div>
  );
}

export function DeliverableList({
  deliverables,
  onChanged,
}: {
  readonly deliverables: readonly Deliverable[];
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  if (deliverables.length === 0) {
    return <EmptyHint>{t('projects.deliverables.empty')}</EmptyHint>;
  }
  return (
    <div className='space-y-3'>
      {deliverables.map((deliverable) => (
        <DeliverableCard
          key={deliverable.id}
          deliverable={deliverable}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
