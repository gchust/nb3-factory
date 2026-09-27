import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { DocumentForm } from './document-form.js';
import type { LibraryOutletContext } from './types.js';

/** Create a document as a dialog over the list. */
export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<LibraryOutletContext>();

  return (
    <RouteDialog
      title={t('library.new')}
      description={t('library.newDescription')}
    >
      <DocumentForm onSaved={() => reload()} />
    </RouteDialog>
  );
}
