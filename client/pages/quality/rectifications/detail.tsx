import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { AttachmentSection } from '@/components/quality/attachments';
import {
  ErrorBlock,
  Field,
  LoadingBlock,
  SimpleSelect,
  StatusBadge,
  type SelectOption,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  NONCONFORMANCE_STATUS_LABEL,
  NONCONFORMANCE_STATUS_TONE,
  fieldErrorMessages,
  formatDateTime,
  formClasses,
  loadAssignableUsers,
  loadNonconformance,
  loadSession,
  notifyQualityDataChanged,
  qualityErrorText,
  reassignNonconformance,
  reviewNonconformance,
  updateNonconformance,
  validateHandlingDraft,
  validateReviewDraft,
  withoutFieldError,
  type AssignableUsers,
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
    const [row, session, assignable] = await Promise.all([
      loadNonconformance(client, id ?? ''),
      loadSession(client),
      loadAssignableUsers(client).catch(() => undefined),
    ]);
    return { row, session, assignable };
  }, id ?? '');
  const [reason, setReason] = useState<string>();
  const [measure, setMeasure] = useState<string>();
  const [comment, setComment] = useState('');
  const [leadId, setLeadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [handlingErrors, setHandlingErrors] = useState<Record<string, string>>(
    {},
  );
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [reassignError, setReassignError] = useState<string>();
  const formId = `${id ?? 'nc'}-form`;

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

  const { row, session, assignable } = state.data;
  const reasonValue = reason ?? row.reason ?? '';
  const measureValue = measure ?? row.measure ?? '';
  const isAssignee = session.user.id === row.assignedToId;
  const canHandle =
    isAssignee &&
    session.capabilities.produce &&
    ['open', 'processing', 'returned'].includes(row.status);
  const canReview =
    session.capabilities.supervise && row.status === 'pending_review';
  const canReassign = session.capabilities.supervise && Boolean(assignable);

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

  async function submitReassign(): Promise<void> {
    if (!leadId) return;
    setError(undefined);
    setReassignError(undefined);
    setBusy(true);
    try {
      await reassignNonconformance(api, row.id, leadId);
      notifyQualityDataChanged();
      state.reload();
    } catch (reassignFailure: unknown) {
      setReassignError(qualityErrorText(reassignFailure, t));
    } finally {
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
          label={t('quality.nc.column.round')}
          value={t('quality.nc.round', { round: row.round })}
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

      <ReviewHistory row={row} />

      {canReassign && assignable ? (
        <ReassignPanel
          row={row}
          assignable={assignable}
          leadId={leadId ?? ''}
          onLeadChange={setLeadId}
          busy={busy}
          error={reassignError}
          onSubmit={() => void submitReassign()}
        />
      ) : null}

      {!canHandle && !canReview && row.reviews.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('quality.nc.readonlyHint')}
        </p>
      ) : null}

      <section className='space-y-3 border-t pt-4'>
        <h2 className='font-heading text-base font-semibold'>
          {t('quality.attachments.evidenceTitle')}
        </h2>
        {roundsOf(row).map((round) => (
          <div key={round} className='space-y-3'>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('quality.nc.round', { round })}
              {round === row.round
                ? ` · ${t('quality.nc.currentRound')}`
                : ` · ${t('quality.nc.pastRound')}`}
            </p>
            <AttachmentSection
              targetType='nonconformance'
              targetId={row.id}
              category='nc_problem'
              round={round}
              title={t('quality.attachments.ncProblem')}
              hint={
                round === row.round ? undefined : t('quality.nc.pastRoundHint')
              }
            />
            <AttachmentSection
              targetType='nonconformance'
              targetId={row.id}
              category='nc_after'
              round={round}
              title={t('quality.attachments.ncAfter')}
              hint={
                round === row.round ? undefined : t('quality.nc.pastRoundHint')
              }
            />
          </div>
        ))}
      </section>
    </div>
  );
}

/** Rounds 1..current. Every handling cycle keeps its own evidence. */
function roundsOf(row: QualityNonconformance): readonly number[] {
  const current = Number.isInteger(row.round) && row.round > 0 ? row.round : 1;
  return Array.from({ length: current }, (_, index) => index + 1);
}

function ReviewHistory({
  row,
}: {
  readonly row: QualityNonconformance;
}): ReactElement | null {
  const { t } = useTranslation();
  if (row.reviews.length === 0) return null;
  return (
    <section className='space-y-2 border-t pt-4'>
      <h2 className='font-heading text-base font-semibold'>
        {t('quality.nc.reviewHistory')}
      </h2>
      <ul className='space-y-2'>
        {row.reviews.map((review) => (
          <li
            key={review.id}
            className='space-y-1 rounded-xl border border-border bg-card p-3 text-sm'
          >
            <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              <StatusBadge
                tone={review.decision === 'close' ? 'success' : 'warning'}
              >
                {t(
                  review.decision === 'close'
                    ? 'quality.nc.reviewDecision.close'
                    : 'quality.nc.reviewDecision.return',
                )}
              </StatusBadge>
              <span>{t('quality.nc.round', { round: review.round })}</span>
              <span>
                {t('quality.nc.reviewedBy', {
                  name: review.reviewedByName || review.reviewedById,
                })}{' '}
                · {formatDateTime(review.reviewedAt)}
              </span>
            </div>
            <p>{review.comment || t('quality.nc.noComment')}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReassignPanel({
  row,
  assignable,
  leadId,
  onLeadChange,
  busy,
  error,
  onSubmit,
}: {
  readonly row: QualityNonconformance;
  readonly assignable: AssignableUsers;
  readonly leadId: string;
  readonly onLeadChange: (value: string) => void;
  readonly busy: boolean;
  readonly error?: string;
  readonly onSubmit: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const options: readonly SelectOption[] = assignable.productionLeads.map(
    (lead) => ({ value: lead.id, label: lead.name }),
  );
  return (
    <section className='space-y-2 border-t pt-4'>
      <h2 className='font-heading text-base font-semibold'>
        {t('quality.nc.reassignTitle')}
      </h2>
      <p className='text-xs text-muted-foreground'>
        {t('quality.nc.reassignHint')}
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <SimpleSelect
          value={leadId}
          onValueChange={onLeadChange}
          options={options}
          placeholder={t('quality.tasks.field.selectLead')}
          ariaLabel={t('quality.nc.reassignLead')}
          className='w-64'
        />
        <Button
          type='button'
          variant='outline'
          disabled={busy || !leadId || leadId === row.assignedToId}
          onClick={onSubmit}
        >
          {t('quality.nc.reassign')}
        </Button>
      </div>
      {error ? <ErrorBlock message={error} /> : null}
    </section>
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
