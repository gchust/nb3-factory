import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';

import { DepartmentForm } from './department-form.js';

/** The `new` child route: create a department in a dialog over the list. */
export default function DepartmentCreatePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('documentsAdmin.departments.createTitle')}
      description={t('documentsAdmin.departments.createDescription')}
    >
      <DepartmentForm />
    </RouteDialog>
  );
}
