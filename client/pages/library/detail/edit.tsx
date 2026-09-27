import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { DocumentForm } from '../document-form.js';
import type { LibraryDetailOutletContext } from '../types.js';

/** Edit the document the detail drawer is showing, stacked on top of it. */
export default function EditDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const { document, onSaved } = useOutletContext<LibraryDetailOutletContext>();

  return (
    <RouteDialog
      title={t('library.edit')}
      description={t('library.editDescription')}
    >
      {document ? <DocumentForm document={document} onSaved={onSaved} /> : null}
    </RouteDialog>
  );
}
