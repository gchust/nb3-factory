import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { BackButton } from '@/components/back-button';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  createClaim,
  fetchClaim,
  fetchDepartments,
  submitClaim,
  updateClaim,
} from './claim-api.js';
import { ClaimForm } from './claim-form.js';
import {
  buildClaimInput,
  claimFormTotal,
  newClaimFormItem,
  type ClaimFormErrors,
  type ClaimFormValues,
} from './claim-form-model.js';
import { formatAmount } from './claim-format.js';
import type { ClaimDetail, Department } from './types.js';

export interface ClaimEditorProps {
  /** Present when editing an existing claim; absent when creating one. */
  readonly claimId?: string;
}

const EMPTY_VALUES: ClaimFormValues = {
  title: '',
  departmentId: '',
  remark: '',
  items: [newClaimFormItem()],
};

/** The stored claim's lines, turned back into the form's text-shaped values. */
function toFormValues(detail: ClaimDetail): ClaimFormValues {
  return {
    title: detail.claim.title,
    departmentId: detail.claim.departmentId ?? '',
    remark: detail.claim.remark ?? '',
    items: detail.items.map((item) => ({
      key: item.id,
      category: item.category as ClaimFormValues['items'][number]['category'],
      amount: formatAmount(item.amount),
      expenseDate: (item.expenseDate ?? '').slice(0, 10),
      description: item.description ?? '',
      invoices:
        item.invoiceId && item.invoiceName && item.invoiceExt
          ? [
              {
                id: item.invoiceId,
                disk: 'local',
                key: '',
                filename: item.invoiceName,
                ext: item.invoiceExt,
                // The stored MIME type is what enables the image preview; a missing one falls back to a
                // non-image preview rather than guessing.
                mimeType: item.invoiceType ?? 'application/octet-stream',
                size: 0,
                createdAt: '',
                updatedAt: '',
              },
            ]
          : [],
    })),
  };
}

/** What the user asked the save to do; the claim's status follows from it. */
type SaveIntent = 'draft' | 'submit';

/**
 * The create and edit form.
 *
 * One component serves both because the fields, the validation and the save path are the same; only where the initial
 * values come from and what the buttons say differ. Editing loads the claim again rather than taking it from the list,
 * so a save cannot overwrite a change someone else made in between (guideline R1).
 */
export function ClaimEditor({ claimId }: ClaimEditorProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();

  // The departments are the department picker's options; a failure only hides the picker's choices.
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchDepartments(api, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          setDepartments(data);
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly detail?: ClaimDetail;
    readonly error?: unknown;
  }>();
  const loadKey = claimId ?? 'new';

  useEffect(() => {
    if (!claimId) {
      return undefined;
    }
    const controller = new AbortController();
    const key = claimId;
    fetchClaim(api, claimId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, detail });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, error });
        }
      },
    );
    return () => controller.abort();
  }, [api, claimId]);

  const loadPending = claimId !== undefined && loaded?.key !== loadKey;
  const loadError = loadPending ? undefined : loaded?.error;
  const detail = loaded?.detail;

  const [values, setValues] = useState<ClaimFormValues | undefined>(
    claimId ? undefined : EMPTY_VALUES,
  );
  const [valuesSource, setValuesSource] = useState<string | undefined>();
  const [errors, setErrors] = useState<ClaimFormErrors>();
  const [failure, setFailure] = useState<string>();
  const [saving, setSaving] = useState<SaveIntent>();

  // Fill the form once the claim arrives, or refill it after a reload. Derived from the loaded result rather than an
  // effect, so the first render after loading already shows the values.
  if (detail && valuesSource !== loadKey) {
    setValuesSource(loadKey);
    setValues(toFormValues(detail));
  }

  if (loadPending) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={t(claimId ? 'expense.edit.title' : 'expense.create.title')}
          />
          <Loading />
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (loadError) {
    const unauthorized =
      loadError instanceof ApiClientError && loadError.status === 401;
    const missing =
      loadError instanceof ApiClientError && loadError.status === 404;
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader title={t('expense.edit.title')} />
          {unauthorized ? (
            <SessionExpiredAlert />
          ) : (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertTitle>{t('expense.error.title')}</AlertTitle>
              <AlertDescription>
                {missing
                  ? t('expense.edit.notFound')
                  : t('expense.error.requestFailed')}
              </AlertDescription>
            </Alert>
          )}
          <div>
            <Button
              variant='outline'
              onClick={() => void navigate('/expenses', { replace: true })}
            >
              {t('expense.edit.backToList')}
            </Button>
          </div>
        </PageContainer>
      </RouteChildPage>
    );
  }

  const form = values ?? EMPTY_VALUES;
  const editable = detail
    ? detail.claim.status === 'draft' || detail.claim.status === 'rejected'
    : true;
  const resubmitting = detail?.claim.status === 'rejected';

  async function save(intent: SaveIntent): Promise<void> {
    const { input, errors: found } = buildClaimInput(form);
    if (!input) {
      setErrors(found);
      return;
    }
    setErrors(undefined);
    setFailure(undefined);
    setSaving(intent);
    try {
      const saved = claimId
        ? await updateClaim(api, claimId, input)
        : await createClaim(api, input);
      const result =
        intent === 'submit' ? await submitClaim(api, saved.claim.id) : saved;
      // Replace, so the browser's Back does not reopen a form whose work is already saved.
      await navigate(`/expenses/${encodeURIComponent(result.claim.id)}`, {
        replace: true,
      });
    } catch (reason) {
      setFailure(describeSaveFailure(reason, t, claimId !== undefined));
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={t(claimId ? 'expense.edit.title' : 'expense.create.title')}
          description={t(
            claimId ? 'expense.edit.description' : 'expense.create.description',
          )}
        />

        {!editable ? (
          <Alert>
            <AlertTitle>{t('expense.edit.lockedTitle')}</AlertTitle>
            <AlertDescription>{t('expense.edit.locked')}</AlertDescription>
          </Alert>
        ) : null}

        {failure ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertTitle>{t('expense.error.saveFailedTitle')}</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <ClaimForm
          values={form}
          onChange={setValues}
          departments={departments}
          errors={errors}
          disabled={saving !== undefined || !editable}
        />

        <div className='flex flex-wrap items-center justify-end gap-2'>
          <p className='mr-auto text-sm text-muted-foreground'>
            {t('expense.form.total')}:{' '}
            <span className='font-medium tabular-nums'>
              {formatAmount(claimFormTotal(form.items))}
            </span>
          </p>
          <Button
            variant='outline'
            disabled={saving !== undefined || !editable}
            onClick={() => void save('draft')}
          >
            {saving === 'draft' ? <Spinner /> : null}
            {t('expense.form.saveDraft')}
          </Button>
          <Button
            disabled={saving !== undefined || !editable}
            onClick={() => void save('submit')}
          >
            {saving === 'submit' ? <Spinner /> : null}
            {resubmitting
              ? t('expense.form.resubmit')
              : t('expense.form.saveAndSubmit')}
          </Button>
        </div>
      </PageContainer>
    </RouteChildPage>
  );
}

/** Turn a failed save into one sentence the user can act on, never the backend's raw message. */
function describeSaveFailure(
  error: unknown,
  t: ReturnType<typeof useTranslation>['t'],
  editing: boolean,
): string {
  if (!(error instanceof ApiClientError)) {
    return t('expense.error.requestFailed');
  }
  if (error.status === 401) {
    return t('status.sessionExpired');
  }
  if (error.status === 403) {
    return t('expense.error.forbidden');
  }
  if (error.status === 404) {
    return editing
      ? t('expense.edit.notFound')
      : t('expense.error.requestFailed');
  }
  switch (error.reason) {
    case 'EXPENSE_INVALID_STATUS':
      return t('expense.error.invalidStatus');
    case 'EXPENSE_CONFLICT':
      return t('expense.error.conflict');
    case 'EXPENSE_EMPTY_CLAIM':
      return t('expense.error.emptyClaim');
    case 'EXPENSE_VALIDATION':
      return t('expense.error.validation');
    default:
      return t('expense.error.requestFailed');
  }
}
