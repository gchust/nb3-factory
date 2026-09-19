import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { AttachmentSection } from '@/components/quality/attachments';
import {
  ErrorBlock,
  Field,
  LoadingBlock,
  StatusBadge,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  NONCONFORMANCE_STATUS_LABEL,
  NONCONFORMANCE_STATUS_TONE,
  fieldErrorMessages,
  formatDateTime,
  formClasses,
  loadNonconformance,
  loadSession,
  notifyQualityDataChanged,
  qualityErrorText,
  reviewNonconformance,
  updateNonconformance,
  validateHandlingDraft,
  validateReviewDraft,
  withoutFieldError,
  type QualityNonconformance,
} from '@/components/quality/lib';

export default function QualityRectificationDetailPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('quality.rectifications.detailTitle')}
      className='sm:max-w-3xl'
    >
      <RectificationDetail />
    </RouteDialog>
  );
}

function RectificationDetail(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const state = useApiData(async (client) => {
    const [row, session] = await Promise.all([
      loadNonconformance(client, id ?? ''),
      loadSession(client),
    ]);
    return { row, session };
  }, id ?? '');
  const [reason, setReason] = useState<string>();
  const [measure, setMeasure] = useState<string>();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [handlingErrors, setHandlingErrors] = useState<Record<string, string>>(
    {},
  );
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const formId = useId();

  function clearHandlingError(field: string): void {
    setHandlingErrors((current) => withoutFieldError(current, field));
  }

  function clearReviewError(field: string): void {
    setReviewErrors((current) => withoutFieldError(current, field));
  }

  if (state.loading) return <LoadingBlock label={t('status.loading')} />;
  if (state.error)
    return <ErrorBlock message={state.error} onRetry={state.reload} />;
  if (!state.data)
    return <ErrorBlock message={t('quality.rectifications.notFound')} />;

  const { row, session } = state.data;
  const reasonValue = reason ?? row.reason ?? '';
  const measureValue = measure ?? row.measure ?? '';
  const isAssignee = session.user.id === row.assignedToId;
  const canHandle =
    isAssignee &&
    session.capabilities.produce &&
    ['open', 'processing', 'returned'].includes(row.status);
  const canReview =
    session.capabilities.supervise && row.status === 'pending_review';

  async function submitHandling(submitForReview: boolean): Promise<void> {
    setError(undefined);
    const validation = validateHandlingDraft({
      reason: reasonValue,
      measure: measureValue,
    });
    if (validation.length > 0) {
      setHandlingErrors(fieldErrorMessages(validation, t));
      return;
    }
    setHandlingErrors({});
    setBusy(true);
    try {
      await updateNonconformance(api, row.id, {
        reason: reasonValue,
        measure: measureValue,
        submit: submitForReview,
      });
      notifyQualityDataChanged();
      await close();
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
      setBusy(false);
    }
  }

  async function submitReview(decision: 'close' | 'return'): Promise<void> {
    setError(undefined);
    const validation = validateReviewDraft(decision, comment);
    if (validation.length > 0) {
      setReviewErrors(fieldErrorMessages(validation, t));
      return;
    }
    setReviewErrors({});
    setBusy(true);
    try {
      await reviewNonconformance(api, row.id, {
        decision,
        comment: comment.trim() || null,
      });
      notifyQualityDataChanged();
      await close();
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
      setBusy(false);
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{row.code}</span>
        <StatusBadge tone={NONCONFORMANCE_STATUS_TONE[row.status]}>
          {t(NONCONFORMANCE_STATUS_LABEL[row.status])}
        </StatusBadge>
        <span className='text-sm text-muted-foreground'>{row.title}</span>
      </div>

      <dl className='grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2'>
        <Detail
          label={t('quality.nc.column.product')}
          value={`${row.productName} · ${row.batchNo}`}
        />
        <Detail label={t('quality.nc.column.taskNo')} value={row.taskNo} />
        <Detail label={t('quality.nc.column.item')} value={row.itemName} />
        <Detail
          label={t('quality.nc.column.assignee')}
          value={row.assignedToName || row.assignedToId}
        />
        <Detail
          label={t('quality.nc.column.status')}
          value={t(NONCONFORMANCE_STATUS_LABEL[row.status])}
        />
        <Detail
          label={t('quality.nc.column.updatedAt')}
          value={formatDateTime(row.handledAt ?? row.createdAt)}
        />
      </dl>

      {row.description ? (
        <p className='rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground'>
          {row.description}
        </p>
      ) : null}

      {Object.keys(handlingErrors).length > 0 ||
      Object.keys(reviewErrors).length > 0 ? (
        <ErrorBlock message={t('quality.validation.fixFields')} />
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {canHandle ? (
        <form
          id={formId}
          noValidate
          className='space-y-4'
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void submitHandling(true);
          }}
        >
          <Field
            label={t('quality.nc.field.reason')}
            htmlFor={`${formId}-reason`}
            required
            error={handlingErrors.reason}
          >
            <textarea
              id={`${formId}-reason`}
              aria-invalid={Boolean(handlingErrors.reason)}
              className={formClasses.textarea}
              rows={3}
              value={reasonValue}
              onChange={(event) => {
                setReason(event.target.value);
                clearHandlingError('reason');
              }}
            />
          </Field>
          <Field
            label={t('quality.nc.field.measure')}
            htmlFor={`${formId}-measure`}
            required
            error={handlingErrors.measure}
          >
            <textarea
              id={`${formId}-measure`}
              aria-invalid={Boolean(handlingErrors.measure)}
              className={formClasses.textarea}
              rows={3}
              value={measureValue}
              onChange={(event) => {
                setMeasure(event.target.value);
                clearHandlingError('measure');
              }}
            />
          </Field>
          <div className={formClasses.actions}>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => void submitHandling(false)}
            >
              {t('quality.nc.saveDraft')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('quality.nc.submitReview')}
            </Button>
          </div>
        </form>
      ) : (
        <ReadonlyHandling row={row} />
      )}

      {canReview ? (
        <section className='space-y-3 border-t pt-4'>
          <h2 className='font-heading text-base font-semibold'>
            {t('quality.nc.reviewTitle')}
          </h2>
          <Field
            label={t('quality.nc.field.comment')}
            htmlFor={`${formId}-comment`}
            error={reviewErrors.comment}
          >
            <textarea
              id={`${formId}-comment`}
              aria-invalid={Boolean(reviewErrors.comment)}
              className={formClasses.textarea}
              rows={3}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                clearReviewError('comment');
              }}
            />
          </Field>
          <div className={formClasses.actions}>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => void submitReview('return')}
            >
              {t('quality.nc.return')}
            </Button>
            <Button
              type='button'
              disabled={busy}
              onClick={() => void submitReview('close')}
            >
              {t('quality.nc.close')}
            </Button>
          </div>
        </section>
      ) : null}

      {row.reviewedAt ? (
        <section className='space-y-1 rounded-xl border border-border bg-card p-4 text-sm'>
          <p className='text-xs text-muted-foreground'>
            {t('quality.nc.reviewedBy', {
              name: row.reviewedByName || row.reviewedById || '',
            })}{' '}
            · {formatDateTime(row.reviewedAt)}
          </p>
          <p>{row.reviewComment || t('quality.nc.noComment')}</p>
        </section>
      ) : null}

      {!canHandle && !canReview && !row.reviewedAt ? (
        <p className='text-sm text-muted-foreground'>
          {t('quality.nc.readonlyHint')}
        </p>
      ) : null}

      <section className='space-y-3 border-t pt-4'>
        <h2 className='font-heading text-base font-semibold'>
          {t('quality.attachments.evidenceTitle')}
        </h2>
        <AttachmentSection
          targetType='nonconformance'
          targetId={row.id}
          category='nc_problem'
          title={t('quality.attachments.ncProblem')}
        />
        <AttachmentSection
          targetType='nonconformance'
          targetId={row.id}
          category='nc_after'
          title={t('quality.attachments.ncAfter')}
        />
      </section>
    </div>
  );
}

function ReadonlyHandling({
  row,
}: {
  readonly row: QualityNonconformance;
}): ReactElement {
  const { t } = useTranslation();
  if (!row.reason && !row.measure) return <></>;
  return (
    <div className='space-y-2 text-sm'>
      <div>
        <p className='text-xs text-muted-foreground'>
          {t('quality.nc.field.reason')}
        </p>
        <p>{row.reason ?? '—'}</p>
      </div>
      <div>
        <p className='text-xs text-muted-foreground'>
          {t('quality.nc.field.measure')}
        </p>
        <p>{row.measure ?? '—'}</p>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='min-w-0'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='truncate font-medium'>{value}</dd>
    </div>
  );
}
