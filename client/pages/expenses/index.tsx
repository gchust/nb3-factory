import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  deleteExpenseReport,
  fetchExpenseMeta,
  submitExpenseReport,
  type ExpenseMeta,
  type ExpenseReportSummary,
} from './api.js';
import { expenseErrorMessage } from './errors.js';
import { ReportList } from './report-list.js';
import { Notice } from './shared.jsx';

export default function ExpensesPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [meta, setMeta] = useState<ExpenseMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseReportSummary>();
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchExpenseMeta(api);
        if (!controller.signal.aborted) setMeta(result);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(expenseErrorMessage(caught, t('expenses.loadFailed')));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, t]);

  const canCreate =
    meta !== undefined &&
    (meta.actor.role === 'employee' ||
      meta.actor.role === 'manager' ||
      meta.actor.role === 'admin');

  async function handleSubmit(report: ExpenseReportSummary): Promise<void> {
    setBusyId(report.id);
    setError(undefined);
    setMessage(undefined);
    try {
      await submitExpenseReport(api, report.id);
      setMessage(t('expenses.messages.submitted', { number: report.number }));
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        expenseErrorMessage(caught, t('expenses.messages.actionFailed')),
      );
    } finally {
      setBusyId(undefined);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(undefined);
    setMessage(undefined);
    try {
      await deleteExpenseReport(api, deleteTarget.id);
      setMessage(
        t('expenses.messages.deleted', { number: deleteTarget.number }),
      );
      setDeleteTarget(undefined);
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(
        expenseErrorMessage(caught, t('expenses.messages.actionFailed')),
      );
    } finally {
      setBusyId(undefined);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <Loading className='py-16' />
      </PageContainer>
    );
  }

  const isOwnerView =
    meta?.actor.role === 'employee' || meta?.actor.role === undefined;

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate ? (
            <Button render={<Link to='new' />}>
              {t('expenses.newReport')}
            </Button>
          ) : null
        }
        description={t('expenses.description')}
        title={t('expenses.title')}
      />

      {message ? <Notice tone='success'>{message}</Notice> : null}
      {error ? <Notice tone='error'>{error}</Notice> : null}

      <ReportList
        categories={meta?.categories ?? []}
        emptyDescription={t('expenses.emptyDescription')}
        refreshToken={refreshToken}
        renderActions={(report) => {
          const canManageDraft = report.status === 'draft';
          if (!canManageDraft) return null;
          return (
            <>
              <Button
                render={<Link to={`/expenses/${report.id}/edit`} />}
                size='sm'
                variant='outline'
              >
                {t('expenses.actions.edit')}
              </Button>
              <Button
                disabled={busyId === report.id}
                onClick={() => {
                  void handleSubmit(report);
                }}
                size='sm'
                variant='secondary'
              >
                {t('expenses.actions.submit')}
              </Button>
              <Button
                disabled={busyId === report.id}
                onClick={() => setDeleteTarget(report)}
                size='sm'
                variant='destructive'
              >
                {t('expenses.actions.delete')}
              </Button>
            </>
          );
        }}
        scope='mine'
        showEmployee={!isOwnerView}
      />

      <Outlet />

      <Dialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        open={deleteTarget !== undefined}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('expenses.delete.description', {
                number: deleteTarget?.number ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setDeleteTarget(undefined)}
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busyId === deleteTarget?.id}
              onClick={() => {
                void handleDelete();
              }}
              variant='destructive'
            >
              {t('expenses.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
