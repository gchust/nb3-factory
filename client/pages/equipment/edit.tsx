import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { EquipmentForm } from './equipment-form.js';
import { getEquipment } from './api.js';
import { OverlayCancelButton, OverlaySubmitButton } from './overlay-actions.js';
import type { Equipment, EquipmentOutletContext } from './types.js';

const FORM_ID = 'equipment-edit-form';

/** Route `/equipment/:equipmentId/edit`: edit an equipment record. */
export default function EditEquipmentPage(): ReactElement {
  const { equipmentId = '' } = useParams();
  // Key by id, so switching records with forward or back starts the dialog over.
  return <EditEquipment key={equipmentId} equipmentId={equipmentId} />;
}

function EditEquipment({
  equipmentId,
}: {
  readonly equipmentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<EquipmentOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${equipmentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly equipment?: Equipment;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${equipmentId}:${reloadCount}`;
    getEquipment(api, equipmentId, controller.signal).then(
      (equipment) => {
        if (!controller.signal.aborted) setResult({ key, equipment });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        if (error instanceof ApiClientError && error.status === 404) {
          reload();
        }
      },
    );
    return () => controller.abort();
  }, [api, equipmentId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const equipment = loading ? undefined : result?.equipment;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('equipment.error.notFound')
            : t('equipment.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <OverlayCancelButton />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('equipment.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <OverlayCancelButton />;
  } else if (!equipment) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['assetCode', 'name', 'category', 'notes'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <OverlayCancelButton />;
  } else {
    body = (
      <EditEquipmentBody
        equipment={equipment}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          reload();
        }}
      />
    );
    footer = <EditEquipmentFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('equipment.edit.title')}
      description={t('equipment.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function EditEquipmentBody({
  equipment,
  onSubmittingChange,
  onNotFound,
}: {
  readonly equipment: Equipment;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<EquipmentOutletContext>();
  return (
    <EquipmentForm
      equipment={equipment}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditEquipmentFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <OverlayCancelButton disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.save')}
        submittingLabel={t('actions.saving')}
      />
    </>
  );
}
