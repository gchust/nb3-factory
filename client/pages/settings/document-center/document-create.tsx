import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';

import { DocumentForm } from './document-form.js';

/** The `new` child route: create a document in a dialog over the list. */
export default function DocumentCreatePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('documentsAdmin.form.createTitle')}
      description={t('documentsAdmin.form.createDescription')}
    >
      <DocumentForm />
    </RouteDialog>
  );
}
