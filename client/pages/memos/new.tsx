import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MemoForm } from './memo-form.js';
import type { CustomerMemo, MemosOutletContext } from './types.js';

const FORM_ID = 'memo-create-form';

/**
 * The create dialog, reached at `/memos/new`.
 *
 * `useRouteOverlay()` reads the overlay context, so it is called in the body and footer components below — the page
 * component itself renders the overlay and sits above its provider.
 */
export default function MemoCreatePage(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<MemosOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('memos.create.title')}
      description={t('memos.create.description')}
      footer={<CreateFooter submitting={submitting} />}
    >
      <CreateBody
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reload();
        }}
      />
    </RouteDialog>
  );
}

function CreateBody({
  onSubmitted,
  onSubmittingChange,
}: {
  readonly onSubmitted: (memo: CustomerMemo) => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <MemoForm
      formId={FORM_ID}
      onSubmitted={(memo) => {
        onSubmitted(memo);
        void close();
      }}
      onSubmittingChange={onSubmittingChange}
    />
  );
}

function CreateFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
