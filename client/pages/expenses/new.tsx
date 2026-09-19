import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';

import { ExpenseReportForm } from './form.js';

export default function NewExpensePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      description={t('expenses.form.createDescription')}
      title={t('expenses.form.createTitle')}
    >
      <ExpenseReportForm />
    </RouteDialog>
  );
}
