/**
 * The create-document overlay: a child route of the list presented as a dialog.
 *
 * It is reachable at `/library/new`, so the server's create policy is the only
 * thing standing between a caller and a new document. The dialog hides the
 * action from accounts that lack the capability, but it does not depend on
 * that: a reader who opens the URL directly still gets a 403 from the API.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { createDocument } from './library-api.js';
import { LibraryForm } from './library-form.js';
import type { LibraryOutletContext } from './index.js';
import type { LibraryDocumentInput } from './types.js';

/** Rendered inside the dialog, so it may read the overlay context. */
function NewDocumentForm(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const api = useApiClient();
  const toaster = useToaster();
  const { reload } = useOutletContext<LibraryOutletContext>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(input: LibraryDocumentInput): Promise<void> {
    setIsSubmitting(true);
    try {
      await createDocument(api, input);
      toaster.show({ type: 'success', title: t('library.create.success') });
      reload();
      await close();
    } catch {
      toaster.show({ type: 'error', title: t('library.submit.error') });
      setIsSubmitting(false);
    }
  }

  return (
    <LibraryForm
      initial={null}
      isSubmitting={isSubmitting}
      onCancel={() => {
        void close();
      }}
      onSubmit={(input) => {
        void submit(input);
      }}
    />
  );
}

export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      description={t('library.create.description')}
      title={t('library.create.title')}
    >
      <NewDocumentForm />
    </RouteDialog>
  );
}
