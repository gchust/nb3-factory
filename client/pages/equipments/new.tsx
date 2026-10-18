import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useId, useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';

import { createEquipment, type EquipmentInput } from './api.js';
import { EquipmentForm } from './equipment-form.js';
import { OverlayCloseBridge } from './overlay-close-bridge.js';
import type { EquipmentListOutletContext } from './types.js';

function NewEquipmentFooter({
  formId,
  submitting,
}: {
  readonly formId: string;
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        onClick={() => void close()}
        disabled={submitting}
      >
        {t('equipment.actions.cancel')}
      </Button>
      <Button type='submit' form={formId} disabled={submitting}>
        {submitting
          ? t('equipment.actions.saving')
          : t('equipment.actions.save')}
      </Button>
    </>
  );
}

/** `/equipments/new`, a dialog over the ledger. */
export default function NewEquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const toaster = useToaster();
  const outlet = useOutletContext<EquipmentListOutletContext>();
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const allowCloseRef = useRef(false);
  const closeRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const rememberClose = useCallback((close: () => Promise<void>) => {
    closeRef.current = close;
  }, []);

  const submit = async (input: EquipmentInput): Promise<void> => {
    setSubmitting(true);
    try {
      await createEquipment(client, input);
      toaster.show({ type: 'success', title: t('equipment.toast.created') });
      outlet.reload();
      allowCloseRef.current = true;
      await closeRef.current?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RouteDialog
      title={t('equipment.create.title')}
      description={t('equipment.create.description')}
      footer={<NewEquipmentFooter formId={formId} submitting={submitting} />}
      beforeClose={() => allowCloseRef.current || !submitting}
    >
      <OverlayCloseBridge onReady={rememberClose} />
      <EquipmentForm formId={formId} onSubmit={submit} />
    </RouteDialog>
  );
}
