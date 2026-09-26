import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchEquipment } from './api.js';
import { EquipmentForm } from './equipment-form.js';
import type { Equipment, EquipmentOutletContext } from './types.js';

const FORM_ID = 'equipment-edit-form';

/** Editing a device: a child-route dialog that loads the latest record before showing the form. */
export default function EditEquipmentDialog(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  // The form exists only once the record has loaded, so the footer hides Save until then.
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = useCallback((value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  }, []);
  const handleLoaded = useCallback(() => setReady(true), []);
  const handleNotFound = useCallback(() => setMissing(true), []);

  return (
    <RouteDialog
      title={t('equipment.edit.title')}
      description={t('equipment.edit.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, the backdrop and close() all go through beforeClose.
      beforeClose={() => !submittingRef.current}
      footer={
        <EditEquipmentFooter
          submitting={submitting}
          ready={ready}
          missing={missing}
        />
      }
    >
      <EditEquipmentBody
        missing={missing}
        onLoaded={handleLoaded}
        onNotFound={handleNotFound}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function EditEquipmentBody({
  missing,
  onLoaded,
  onNotFound,
  onSubmittingChange,
}: {
  readonly missing: boolean;
  readonly onLoaded: () => void;
  readonly onNotFound: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const { reload } = useOutletContext<EquipmentOutletContext>();
  const { close } = useRouteOverlay();
  const id = Number(equipmentId);

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${equipmentId}:${String(reloadCount)}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly equipment?: Equipment;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${equipmentId}:${String(reloadCount)}`;
    fetchEquipment(api, id, controller.signal).then(
      (equipment) => {
        if (!controller.signal.aborted) {
          setResult({ key, equipment });
          onLoaded();
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiClientError && error.status === 404) {
          onNotFound();
        }
        setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, equipmentId, id, onLoaded, onNotFound, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const equipment = loading ? undefined : result?.equipment;

  if (loading) {
    return (
      <div className='space-y-4' role='status' aria-label={t('status.loading')}>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-20 w-full' />
      </div>
    );
  }

  if (missing) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('equipment.edit.missingTitle')}</AlertTitle>
        <AlertDescription>
          {t('equipment.edit.missingDescription')}
        </AlertDescription>
      </Alert>
    );
  }

  if (!equipment) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>
          {notFound
            ? t('equipment.edit.missingTitle')
            : t('equipment.error.title')}
        </AlertTitle>
        <AlertDescription>
          {notFound
            ? t('equipment.edit.missingDescription')
            : forbidden
              ? t('equipment.error.forbidden')
              : t('equipment.error.requestFailed')}
        </AlertDescription>
        {notFound || forbidden ? null : (
          <AlertAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setReloadCount((count) => count + 1)}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  }

  return (
    <EquipmentForm
      formId={FORM_ID}
      equipment={equipment}
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
  ready,
  missing,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
  readonly missing: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {ready ? t('actions.cancel') : t('actions.close')}
      </Button>
      {ready && !missing ? (
        <Button type='submit' form={FORM_ID} disabled={submitting}>
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {submitting ? t('actions.saving') : t('actions.save')}
        </Button>
      ) : null}
    </>
  );
}
