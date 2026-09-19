import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import { fetchExpenseMeta, type ExpenseMeta } from './expenses/api.js';
import { ReportList } from './expenses/report-list.js';
import { Notice } from './expenses/shared.jsx';
import { expenseErrorMessage } from './expenses/errors.js';

export default function ExpenseApprovalsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [meta, setMeta] = useState<ExpenseMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchExpenseMeta(api);
        if (!controller.signal.aborted) setMeta(result);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(expenseErrorMessage(caught, t('expenses.loadFailed'), t));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, t]);

  if (loading) {
    return (
      <PageContainer>
        <Loading className='py-16' />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        description={t('expenses.approvals.description', {
          department: meta?.actor.departmentName ?? '—',
        })}
        title={t('expenses.approvals.title')}
      />
      {error ? <Notice tone='error'>{error}</Notice> : null}
      <ReportList
        categories={meta?.categories ?? []}
        defaultStatus='submitted'
        emptyDescription={t('expenses.approvals.emptyDescription')}
        emptyTitle={t('expenses.approvals.empty')}
        scope='approvals'
        showEmployee
        viewLabelKey='expenses.actions.review'
      />
    </PageContainer>
  );
}
