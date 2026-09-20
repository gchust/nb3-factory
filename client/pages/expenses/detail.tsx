import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import {
  approveExpenseReport,
  fetchExpenseReport,
  linkExpenseItemFile,
  linkExpenseReportFile,
  payExpenseReport,
  rejectExpenseReport,
  removeExpenseFile,
  submitExpenseReport,
  type ExpenseReportDetail,
} from './api.js';
import {
  actionLabelKey,
  formatAmount,
  formatDate,
  formatDateTime,
} from './constants.js';
import { expenseErrorMessage } from './errors.js';
import { ExpenseAttachments } from './files/file-attachments.js';
import { invalidateExpenseData, useExpenseInvalidation } from './refresh.js';
import { ExpenseRevisionHistory } from './revision-history.js';
import { Field, Notice, Panel, StatusBadge } from './shared.jsx';

export default function ExpenseDetailPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [detail, setDetail] = useState<ExpenseReportDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'pay'>();
  const [comment, setComment] = useState('');
  const invalidation = useExpenseInvalidation();

  useEffect(() => {
    if (!reportId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchExpenseReport(api, reportId);
        if (!controller.signal.aborted) {
          setDetail(result);
          setError(undefined);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            expenseErrorMessage(caught, t('expenses.detail.loadFailed'), t),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, reportId, invalidation, t]);

  async function runAction(
    action: () => Promise<ExpenseReportDetail>,
  ): Promise<void> {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await action();
      setDetail(result);
      setDialog(undefined);
      setComment('');
      setMessage(t('expenses.messages.actionDone'));
      // The list that opened this detail is still mounted beneath it and must
      // reflect the new status, so tell every mounted reader to refetch.
      invalidateExpenseData();
    } catch (caught) {
      setError(
        expenseErrorMessage(caught, t('expenses.messages.actionFailed'), t),
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshDetail(): Promise<void> {
    if (!reportId) return;
    setDetail(await fetchExpenseReport(api, reportId));
  }

  async function attachItemFile(itemId: string, fileId: string): Promise<void> {
    if (!reportId) return;
    setDetail(await linkExpenseItemFile(api, reportId, itemId, fileId));
    invalidateExpenseData();
  }

  async function attachReportFile(fileId: string): Promise<void> {
    if (!reportId) return;
    setDetail(await linkExpenseReportFile(api, reportId, fileId));
    invalidateExpenseData();
  }

  async function detachFile(fileId: string): Promise<void> {
    await removeExpenseFile(api, fileId);
    await refreshDetail();
    invalidateExpenseData();
  }

  if (loading) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Loading className='py-16' />
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (!detail) {
    return (
      <RouteChildPage>
        <PageContainer className='mx-auto max-w-4xl'>
          <Breadcrumbs />
          <Notice tone='error'>{error ?? t('expenses.detail.notFound')}</Notice>
          <Button
            onClick={() => {
              void navigate('/expenses');
            }}
            variant='outline'
          >
            {t('expenses.detail.back')}
          </Button>
        </PageContainer>
      </RouteChildPage>
    );
  }

  const {
    report,
    items,
    files: reportFiles,
    actions,
    revisions,
    payment,
    capabilities,
  } = detail;

  // Once a submission exists and the report is no longer editable, the frozen
  // revision is the record of truth; showing the working panels too would just
  // repeat the same receipts. While a returned report is being corrected they
  // still matter, so both are shown.
  const showWorkingFiles =
    capabilities.canManageFiles || revisions.length === 0;

  return (
    <>
      <RouteChildPage>
        <PageContainer className='mx-auto max-w-4xl'>
          <Breadcrumbs />
          <PageHeader
            actions={
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  onClick={() => {
                    void navigate('/expenses');
                  }}
                  variant='outline'
                >
                  {t('expenses.detail.back')}
                </Button>
                {capabilities.canEdit ? (
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    to={`/expenses/${report.id}/edit`}
                  >
                    {t('expenses.actions.edit')}
                  </Link>
                ) : null}
                {capabilities.canSubmit ? (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void runAction(() => submitExpenseReport(api, report.id));
                    }}
                    variant='secondary'
                  >
                    {t('expenses.actions.submit')}
                  </Button>
                ) : null}
                {capabilities.canApprove ? (
                  <Button disabled={busy} onClick={() => setDialog('approve')}>
                    {t('expenses.actions.approve')}
                  </Button>
                ) : null}
                {capabilities.canReject ? (
                  <Button
                    disabled={busy}
                    onClick={() => setDialog('reject')}
                    variant='destructive'
                  >
                    {t('expenses.actions.reject')}
                  </Button>
                ) : null}
                {capabilities.canPay ? (
                  <Button disabled={busy} onClick={() => setDialog('pay')}>
                    {t('expenses.actions.pay')}
                  </Button>
                ) : null}
              </div>
            }
            description={report.purpose ?? undefined}
            title={report.number}
          />

          {message ? <Notice tone='success'>{message}</Notice> : null}
          {error ? <Notice tone='error'>{error}</Notice> : null}

          <Panel>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              <Field label={t('expenses.columns.status')}>
                <StatusBadge status={report.status} />
              </Field>
              <Field label={t('expenses.columns.employee')}>
                {report.employeeName}
              </Field>
              <Field label={t('expenses.columns.department')}>
                {report.departmentName}
              </Field>
              <Field label={t('expenses.columns.amount')}>
                {formatAmount(report.totalAmount)}
              </Field>
              <Field label={t('expenses.detail.submittedAt')}>
                {formatDateTime(report.submittedAt)}
              </Field>
              <Field label={t('expenses.detail.decidedAt')}>
                {formatDateTime(report.decidedAt)}
              </Field>
              <Field label={t('expenses.detail.createdAtLabel')}>
                {formatDateTime(report.createdAt)}
              </Field>
              {payment ? (
                <Field label={t('expenses.detail.paidAt')}>
                  {formatDateTime(payment.paidAt)}
                </Field>
              ) : null}
            </div>
            {report.decisionComment ? (
              <Notice className='mt-4' tone='warning'>
                {t('expenses.detail.decisionComment')}: {report.decisionComment}
              </Notice>
            ) : null}
          </Panel>

          <Panel title={t('expenses.detail.items')}>
            {items.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('expenses.detail.noItems')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('expenses.form.category')}</TableHead>
                    <TableHead>{t('expenses.form.date')}</TableHead>
                    <TableHead>{t('expenses.form.description')}</TableHead>
                    <TableHead>{t('expenses.files.receiptsTitle')}</TableHead>
                    <TableHead className='text-right'>
                      {t('expenses.form.amount')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.categoryName}</TableCell>
                      <TableCell>{formatDate(item.expenseDate)}</TableCell>
                      <TableCell>{item.description ?? '—'}</TableCell>
                      <TableCell>
                        {t('expenses.files.count', {
                          count: item.files.length,
                        })}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatAmount(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          {showWorkingFiles ? (
            <>
              <Panel title={t('expenses.files.receiptsTitle')}>
                {revisions.length > 0 ? (
                  <p className='mb-3 text-sm text-muted-foreground'>
                    {t('expenses.detail.workingHint')}
                  </p>
                ) : null}
                {items.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('expenses.detail.noItems')}
                  </p>
                ) : (
                  <div className='space-y-4'>
                    {items.map((item) => (
                      <div
                        className='space-y-3 rounded-lg border border-border p-3'
                        key={item.id}
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-sm font-medium'>
                            {item.categoryName} · {formatDate(item.expenseDate)}{' '}
                            · {formatAmount(item.amount)}
                          </p>
                          <span className='text-xs text-muted-foreground'>
                            {t('expenses.files.count', {
                              count: item.files.length,
                            })}
                          </span>
                        </div>
                        <ExpenseAttachments
                          attach={(fileId) => attachItemFile(item.id, fileId)}
                          canManage={capabilities.canManageFiles}
                          detach={detachFile}
                          files={item.files}
                          readOnlyHint={t('expenses.files.reviewerHint')}
                          onSaved={() => setMessage(t('expenses.files.saved'))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t('expenses.files.supplementaryTitle')}>
                <p className='mb-3 text-sm text-muted-foreground'>
                  {t('expenses.files.supplementaryHint')}
                </p>
                <ExpenseAttachments
                  attach={attachReportFile}
                  canManage={capabilities.canManageFiles}
                  detach={detachFile}
                  files={reportFiles}
                  readOnlyHint={t('expenses.files.reviewerHint')}
                  onSaved={() => setMessage(t('expenses.files.saved'))}
                />
              </Panel>
            </>
          ) : null}

          <ExpenseRevisionHistory revisions={revisions} />

          <Panel title={t('expenses.detail.timeline')}>
            <ol className='space-y-3'>
              {actions.map((action) => (
                <li className='flex flex-col gap-1' key={action.id}>
                  <div className='flex flex-wrap items-center gap-2 text-sm'>
                    <StatusBadge
                      status={
                        (action.toStatus ?? 'draft') as typeof report.status
                      }
                    />
                    <span className='font-medium'>
                      {t(actionLabelKey(action.action))}
                    </span>
                    <span className='text-muted-foreground'>
                      {action.actorName}
                    </span>
                    {action.revision !== null ? (
                      <span className='text-xs text-muted-foreground'>
                        {t('expenses.detail.revisionTag', {
                          revision: action.revision,
                        })}
                      </span>
                    ) : null}
                    <span className='text-xs text-muted-foreground'>
                      {formatDateTime(action.createdAt)}
                    </span>
                  </div>
                  {action.comment ? (
                    <p className='text-sm text-muted-foreground'>
                      {action.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        </PageContainer>
      </RouteChildPage>
      <Outlet />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDialog(undefined);
            setComment('');
          }
        }}
        open={dialog !== undefined}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'reject'
                ? t('expenses.actions.reject')
                : dialog === 'pay'
                  ? t('expenses.actions.pay')
                  : t('expenses.actions.approve')}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'reject'
                ? t('expenses.detail.rejectDescription')
                : dialog === 'pay'
                  ? t('expenses.detail.payDescription', {
                      amount: formatAmount(report.totalAmount),
                    })
                  : t('expenses.detail.approveDescription')}
            </DialogDescription>
          </DialogHeader>
          {dialog !== 'pay' ? (
            <div className='space-y-2'>
              <Label htmlFor='expense-comment'>
                {dialog === 'reject'
                  ? t('expenses.detail.rejectReason')
                  : t('expenses.detail.approveComment')}
              </Label>
              <Textarea
                id='expense-comment'
                onChange={(event) => setComment(event.target.value)}
                rows={3}
                value={comment}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                setDialog(undefined);
                setComment('');
              }}
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || (dialog === 'reject' && comment.trim() === '')}
              onClick={() => {
                if (dialog === 'approve') {
                  void runAction(() =>
                    approveExpenseReport(api, report.id, comment),
                  );
                } else if (dialog === 'reject') {
                  void runAction(() =>
                    rejectExpenseReport(api, report.id, comment),
                  );
                } else if (dialog === 'pay') {
                  void runAction(() => payExpenseReport(api, report.id));
                }
              }}
              variant={dialog === 'reject' ? 'destructive' : 'default'}
            >
              {t('actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
