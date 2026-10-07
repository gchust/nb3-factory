import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  CreditCardIcon,
  PencilIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilePreviewField } from '@/extensions/nocobase-file-component-ui';

import { ClaimDecisionDialog } from './claim-decision-dialog.js';
import { ClaimPayDialog } from './claim-pay-dialog.js';
import {
  deleteClaim,
  fetchClaim,
  invoiceContentUrl,
  payClaim,
  rejectClaim,
  approveClaim,
  submitClaim,
} from './claim-api.js';
import { formatAmount, formatDateTime, formatDay } from './claim-format.js';
import { ClaimStatusBadge } from './claim-status-badge.js';
import type { ClaimApproval, ClaimDetail, ClaimItem } from './types.js';

export default function ExpenseClaimDetailPage(): ReactElement {
  const { claimId } = useParams();
  if (!claimId) {
    throw new Error('The expense claim route requires a claimId parameter.');
  }
  // Keyed by the id so opening another claim from the same route resets every piece of state below.
  return <ClaimDetailView key={claimId} claimId={claimId} />;
}

function ClaimDetailView({
  claimId,
}: {
  readonly claimId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const loadKey = `${claimId}:${reloadCount}`;
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly detail?: ClaimDetail;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${claimId}:${reloadCount}`;
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
  }, [api, claimId, reloadCount]);

  const loading = loaded?.key !== loadKey;
  const error = loading ? undefined : loaded?.error;
  const detail = loading ? undefined : loaded?.detail;

  const [dialog, setDialog] = useState<
    'approve' | 'reject' | 'pay' | 'delete' | undefined
  >();
  const [action, setAction] = useState<
    'submit' | 'approve' | 'reject' | 'pay' | 'delete' | undefined
  >();
  const [actionFailure, setActionFailure] = useState<string>();

  /** Run one action, then reload the claim so the timeline and the buttons reflect what the server did. */
  async function run(
    kind: 'submit' | 'approve' | 'reject' | 'pay' | 'delete',
    work: () => Promise<void>,
  ): Promise<void> {
    setAction(kind);
    setActionFailure(undefined);
    try {
      await work();
      setDialog(undefined);
      if (kind === 'delete') {
        await navigate('/expenses', { replace: true });
      } else {
        reload();
      }
    } catch (reason) {
      setActionFailure(describeActionFailure(reason, t));
    } finally {
      setAction(undefined);
    }
  }

  function closeDialog(): void {
    setDialog(undefined);
    // A failed attempt leaves its message behind; the next attempt starts clean.
    setActionFailure(undefined);
  }

  if (loading) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <Loading />
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (error) {
    const unauthorized =
      error instanceof ApiClientError && error.status === 401;
    // A claim the actor may not see answers 404 rather than 403, so its absence cannot be told from a claim that
    // does not exist; the copy therefore offers no explanation of who could see it.
    const missing = error instanceof ApiClientError && error.status === 404;
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader title={t('expense.detail.title')} />
          {unauthorized ? (
            <SessionExpiredAlert />
          ) : (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertTitle>{t('expense.error.title')}</AlertTitle>
              <AlertDescription>
                {missing
                  ? t('expense.detail.notFound')
                  : t('expense.error.requestFailed')}
              </AlertDescription>
            </Alert>
          )}
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (!detail) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader title={t('expense.detail.title')} />
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertTitle>{t('expense.error.title')}</AlertTitle>
            <AlertDescription>
              {t('expense.error.requestFailed')}
            </AlertDescription>
          </Alert>
        </PageContainer>
      </RouteChildPage>
    );
  }

  const { claim, items, approvals, capabilities } = detail;
  const busy = action !== undefined;

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={claim.title}
          description={
            <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <span className='font-mono text-xs'>{claim.claimNo}</span>
              <ClaimStatusBadge status={claim.status} />
              <span>{claim.applicantName}</span>
              <span className='tabular-nums font-medium'>
                {formatAmount(claim.totalAmount)}
              </span>
            </span>
          }
          actions={
            <div className='flex flex-wrap items-center gap-2'>
              {capabilities.canEdit ? (
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={
                    <Link
                      to={{
                        pathname: `/expenses/edit/${encodeURIComponent(claim.id)}`,
                        search: location.search,
                      }}
                    />
                  }
                >
                  <PencilIcon data-icon='inline-start' />
                  {t('expense.actions.edit')}
                </Button>
              ) : null}
              {capabilities.canSubmit ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run('submit', () =>
                      submitClaim(api, claim.id).then(() => undefined),
                    )
                  }
                >
                  <UploadIcon data-icon='inline-start' />
                  {t('expense.actions.submit')}
                </Button>
              ) : null}
              {capabilities.canApprove ? (
                <Button disabled={busy} onClick={() => setDialog('approve')}>
                  <ThumbsUpIcon data-icon='inline-start' />
                  {t('expense.actions.approve')}
                </Button>
              ) : null}
              {capabilities.canReject ? (
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => setDialog('reject')}
                >
                  <ThumbsDownIcon data-icon='inline-start' />
                  {t('expense.actions.reject')}
                </Button>
              ) : null}
              {capabilities.canPay ? (
                <Button disabled={busy} onClick={() => setDialog('pay')}>
                  <CreditCardIcon data-icon='inline-start' />
                  {t('expense.actions.pay')}
                </Button>
              ) : null}
              {capabilities.canDelete ? (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('expense.actions.delete')}
                  disabled={busy}
                  onClick={() => setDialog('delete')}
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
          }
        />

        {actionFailure ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertTitle>{t('expense.error.actionFailedTitle')}</AlertTitle>
            <AlertDescription>{actionFailure}</AlertDescription>
          </Alert>
        ) : null}

        {claim.status === 'rejected' ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('expense.detail.rejectedTitle')}</AlertTitle>
            <AlertDescription>
              {latestRejectionComment(approvals) ??
                t('expense.detail.rejectedFallback')}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('expense.detail.summary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <SummaryCell
                label={t('expense.fields.department')}
                value={claim.departmentName ?? '—'}
              />
              <SummaryCell
                label={t('expense.fields.submittedAt')}
                value={formatDateTime(claim.submittedAt, locale) ?? '—'}
              />
              <SummaryCell
                label={t('expense.fields.decidedAt')}
                value={formatDateTime(claim.decidedAt, locale) ?? '—'}
              />
              <SummaryCell
                label={t('expense.fields.paidAt')}
                value={formatDateTime(claim.paidAt, locale) ?? '—'}
              />
              {claim.paymentMethod ? (
                <SummaryCell
                  label={t('expense.fields.paymentMethod')}
                  value={t(`expense.paymentMethod.${claim.paymentMethod}`, {
                    defaultValue: claim.paymentMethod,
                  })}
                />
              ) : null}
              {claim.paymentRemark ? (
                <SummaryCell
                  label={t('expense.fields.paymentRemark')}
                  value={claim.paymentRemark}
                />
              ) : null}
              <SummaryCell
                label={t('expense.fields.createdAt')}
                value={formatDateTime(claim.createdAt, locale) ?? '—'}
              />
              <SummaryCell
                label={t('expense.fields.totalAmount')}
                value={formatAmount(claim.totalAmount)}
              />
            </dl>
            {claim.remark ? (
              <>
                <Separator className='my-4' />
                <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                  {claim.remark}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('expense.detail.items')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemsTable items={items} locale={locale} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('expense.detail.timeline')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalTimeline approvals={approvals} locale={locale} />
          </CardContent>
        </Card>
      </PageContainer>

      <ClaimDecisionDialog
        open={dialog === 'approve' || dialog === 'reject'}
        decision={dialog === 'reject' ? 'reject' : 'approve'}
        claimTitle={claim.title}
        pending={busy}
        failure={actionFailure}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        onSubmit={(comment) => {
          const kind = dialog === 'reject' ? 'reject' : 'approve';
          void run(kind, () =>
            (kind === 'reject'
              ? rejectClaim(api, claim.id, comment)
              : approveClaim(api, claim.id, comment)
            ).then(() => undefined),
          );
        }}
      />

      <ClaimPayDialog
        open={dialog === 'pay'}
        claimTitle={claim.title}
        claimNo={claim.claimNo}
        totalAmount={claim.totalAmount}
        pending={busy}
        failure={actionFailure}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        onSubmit={(paymentMethod, paymentRemark) =>
          void run('pay', () =>
            payClaim(
              api,
              claim.id,
              paymentMethod,
              paymentRemark || undefined,
            ).then(() => undefined),
          )
        }
      />

      <AlertDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => (open ? undefined : closeDialog())}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('expense.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('expense.delete.description', { no: claim.claimNo })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('expense.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={busy}
              onClick={() =>
                void run('delete', () => deleteClaim(api, claim.id))
              }
            >
              {t('expense.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteChildPage>
  );
}

function SummaryCell({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm'>{value}</dd>
    </div>
  );
}

function ItemsTable({
  items,
  locale,
}: {
  readonly items: readonly ClaimItem[];
  readonly locale: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-12'>#</TableHead>
            <TableHead>{t('expense.fields.category')}</TableHead>
            <TableHead>{t('expense.fields.expenseDate')}</TableHead>
            <TableHead>{t('expense.fields.itemDescription')}</TableHead>
            <TableHead className='text-right'>
              {t('expense.fields.amount')}
            </TableHead>
            <TableHead>{t('expense.fields.invoice')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const invoiceUrl = item.invoiceId
              ? invoiceContentUrl({
                  invoiceId: item.invoiceId,
                  invoiceExt: item.invoiceExt,
                })
              : undefined;
            return (
              <TableRow key={item.id}>
                <TableCell className='text-muted-foreground'>
                  {index + 1}
                </TableCell>
                <TableCell>
                  {t(`expense.category.${item.category}`, {
                    defaultValue: item.category,
                  })}
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  {formatDay(item.expenseDate, locale) ?? '—'}
                </TableCell>
                <TableCell className='max-w-xs'>
                  {item.description ?? '—'}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatAmount(item.amount)}
                </TableCell>
                <TableCell>
                  {invoiceUrl && item.invoiceName && item.invoiceExt ? (
                    // The file plugin serves the bytes from an id-addressed URL; no signed link is issued for it.
                    <FilePreviewField
                      files={[
                        {
                          id: item.invoiceId as string,
                          disk: 'local',
                          key: '',
                          filename: item.invoiceName,
                          ext: item.invoiceExt,
                          mimeType: item.invoiceType ?? '',
                          size: 0,
                          createdAt: '',
                          updatedAt: '',
                          contentUrl: invoiceUrl,
                        },
                      ]}
                    />
                  ) : (
                    <span className='text-muted-foreground'>
                      {t('expense.detail.noInvoice')}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ApprovalTimeline({
  approvals,
  locale,
}: {
  readonly approvals: readonly ClaimApproval[];
  readonly locale: string;
}): ReactElement {
  const { t } = useTranslation();
  if (approvals.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('expense.detail.noHistory')}
      </p>
    );
  }
  return (
    <ol className='space-y-4'>
      {approvals.map((approval) => (
        <li key={approval.id} className='flex gap-3'>
          <div
            className='mt-1.5 size-2 shrink-0 rounded-full bg-primary'
            aria-hidden='true'
          />
          <div className='space-y-1'>
            <p className='text-sm'>
              <span className='font-medium'>{approval.operatorName}</span>{' '}
              <span className='text-muted-foreground'>
                {t(`expense.action.${approval.action}`, {
                  defaultValue: approval.action,
                })}
              </span>{' '}
              <span className='text-muted-foreground'>
                ·{' '}
                {t(`expense.status.${approval.fromStatus}`, {
                  defaultValue: approval.fromStatus,
                })}{' '}
                →{' '}
                {t(`expense.status.${approval.toStatus}`, {
                  defaultValue: approval.toStatus,
                })}
              </span>
            </p>
            <p className='text-xs text-muted-foreground'>
              {formatDateTime(approval.createdAt, locale) ?? '—'}
            </p>
            {approval.comment ? (
              <p className='text-sm whitespace-pre-wrap'>{approval.comment}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The reason from the most recent rejection, which is what the applicant has to act on. */
function latestRejectionComment(
  approvals: readonly ClaimApproval[],
): string | undefined {
  for (let index = approvals.length - 1; index >= 0; index -= 1) {
    const approval = approvals[index];
    if (approval.action === 'reject' && approval.comment) {
      return approval.comment;
    }
  }
  return undefined;
}

/** Turn a failed action into one sentence the user can act on, never the backend's raw message. */
function describeActionFailure(
  error: unknown,
  t: ReturnType<typeof useTranslation>['t'],
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
    return t('expense.detail.notFound');
  }
  switch (error.reason) {
    case 'EXPENSE_COMMENT_REQUIRED':
      return t('expense.decision.reasonRequired');
    case 'EXPENSE_INVALID_STATUS':
    case 'EXPENSE_EMPTY_CLAIM':
    case 'EXPENSE_INVALID_PAYMENT_METHOD':
      return t('expense.error.invalidStatus');
    case 'EXPENSE_CONFLICT':
      return t('expense.error.conflict');
    default:
      return t('expense.error.requestFailed');
  }
}
