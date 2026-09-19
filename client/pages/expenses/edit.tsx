import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { ExpenseReportForm } from './form.js';

export default function EditExpensePage(): ReactElement {
  const { t } = useTranslation();
  const { reportId } = useParams();
  return (
    <RouteDialog
      description={t('expenses.form.editDescription')}
      title={t('expenses.form.editTitle')}
    >
      <ExpenseReportForm reportId={reportId} />
    </RouteDialog>
  );
}
