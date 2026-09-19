import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import { fetchExpenseMeta, type ExpenseMeta } from './expenses/api.js';
import { expenseErrorMessage } from './expenses/errors.js';
import { ReportList } from './expenses/report-list.js';
import { Notice } from './expenses/shared.jsx';

export default function ExpenseFinancePage(): ReactElement {
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
          setError(expenseErrorMessage(caught, t('expenses.loadFailed')));
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
        description={t('expenses.finance.description')}
        title={t('expenses.finance.title')}
      />
      {error ? <Notice tone='error'>{error}</Notice> : null}
      <ReportList
        categories={meta?.categories ?? []}
        defaultStatus='approved'
        emptyDescription={t('expenses.finance.emptyDescription')}
        emptyTitle={t('expenses.finance.empty')}
        scope='finance'
        showEmployee
        viewLabelKey='expenses.actions.pay'
      />
    </PageContainer>
  );
}
