import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { EquipmentForm } from './equipment-form.js';
import type { Equipment, EquipmentEditOutletContext } from './types.js';

const FORM_ID = 'equipment-edit-form';

/** Edit a device. The row's "…" menu opens this alone over the list. */
export default function EditEquipmentPage(): ReactElement {
  const { equipmentId = '' } = useParams();
  return <EditEquipment key={equipmentId} equipmentId={equipmentId} />;
}

function EditEquipment({
  equipmentId,
}: {
  readonly equipmentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The list behind the dialog supplies the refresh callbacks through <Outlet context>.
  const { onNotFound } = useOutletContext<EquipmentEditOutletContext>();

  // The state disables the buttons; the ref is for beforeClose, which runs before the new state has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest data by id on open, instead of the list's possibly stale row.
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
    api
      .request<{ data: Equipment }>({
        path: `equipment/${encodeURIComponent(equipmentId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, equipment: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists: tell the list, so it refreshes.
          if (error instanceof ApiClientError && error.status === 404) {
            onNotFound();
          }
        },
      );
    return () => controller.abort();
  }, [api, equipmentId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const equipment = loading ? undefined : result?.equipment;

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound || status === 403) {
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
    footer = <CloseButton label={t('actions.close')} />;
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
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!equipment) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['code', 'name', 'status'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditEquipmentBody
        equipment={equipment}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
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
  const { onSaved } = useOutletContext<EquipmentEditOutletContext>();
  return (
    <EquipmentForm
      formId={FORM_ID}
      equipment={equipment}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // Let the list show the saved record first, then close the dialog.
        onSaved(saved);
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
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled = false,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
