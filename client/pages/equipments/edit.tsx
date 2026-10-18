import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';

import {
  equipmentErrorMessageKey,
  getEquipment,
  updateEquipment,
  type Equipment,
  type EquipmentInput,
} from './api.js';
import { EquipmentForm } from './equipment-form.js';
import { OverlayCloseBridge } from './overlay-close-bridge.js';
import type { EquipmentListOutletContext } from './types.js';

function EditEquipmentFooter({
  formId,
  canSave,
  submitting,
}: {
  readonly formId: string;
  readonly canSave: boolean;
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
      <Button type='submit' form={formId} disabled={!canSave || submitting}>
        {submitting
          ? t('equipment.actions.saving')
          : t('equipment.actions.save')}
      </Button>
    </>
  );
}

/** `/equipments/edit/:id`, a dialog over the ledger with the current values loaded first. */
export default function EditEquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const toaster = useToaster();
  const outlet = useOutletContext<EquipmentListOutletContext>();
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const allowCloseRef = useRef(false);
  const closeRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly equipment?: Equipment;
    readonly errorKey?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const requestKey = id ? `${id}|${revision}` : 'missing';
  const current = loaded?.key === requestKey ? loaded : undefined;
  const equipment = current?.equipment;
  const loadErrorKey = id ? current?.errorKey : 'equipment.errors.notFound';
  const rememberClose = useCallback((close: () => Promise<void>) => {
    closeRef.current = close;
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void getEquipment(client, id, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: requestKey, equipment: next });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            key: requestKey,
            errorKey: equipmentErrorMessageKey(error),
          });
        }
      });
    return () => controller.abort();
  }, [client, id, requestKey]);

  const submit = async (input: EquipmentInput): Promise<void> => {
    if (!equipment) return;
    setSubmitting(true);
    try {
      await updateEquipment(client, equipment.id, input);
      toaster.show({ type: 'success', title: t('equipment.toast.updated') });
      outlet.reload();
      allowCloseRef.current = true;
      await closeRef.current?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RouteDialog
      title={t('equipment.edit.title')}
      description={t('equipment.edit.description')}
      footer={
        <EditEquipmentFooter
          formId={formId}
          canSave={equipment !== undefined}
          submitting={submitting}
        />
      }
      beforeClose={() => allowCloseRef.current || !submitting}
    >
      <OverlayCloseBridge onReady={rememberClose} />
      {loadErrorKey ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('equipment.errors.loadFailed')}</AlertTitle>
          <AlertDescription>{t(loadErrorKey)}</AlertDescription>
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setRevision((current) => current + 1)}
            >
              {t('equipment.actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : equipment ? (
        <EquipmentForm
          key={equipment.id}
          formId={formId}
          equipment={equipment}
          onSubmit={submit}
        />
      ) : (
        <Loading className='py-10' />
      )}
    </RouteDialog>
  );
}
