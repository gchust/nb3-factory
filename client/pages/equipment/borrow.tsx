import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, TriangleAlertIcon } from 'lucide-react';
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
import { BorrowForm } from './borrow-form.js';
import type { Equipment, EquipmentOutletContext } from './types.js';

const FORM_ID = 'equipment-borrow-form';

/** Borrowing a device: a child-route dialog that loads the device and blocks one already on loan. */
export default function BorrowEquipmentDialog(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [missing, setMissing] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = useCallback((value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  }, []);
  const handleLoaded = useCallback(() => setReady(true), []);
  const handleUnavailable = useCallback(() => setUnavailable(true), []);
  const handleNotFound = useCallback(() => setMissing(true), []);

  return (
    <RouteDialog
      title={t('equipment.borrow.title')}
      description={t('equipment.borrow.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <BorrowFooter
          submitting={submitting}
          ready={ready && !unavailable && !missing}
        />
      }
    >
      <BorrowBody
        missing={missing}
        unavailable={unavailable}
        onLoaded={handleLoaded}
        onNotFound={handleNotFound}
        onSubmittingChange={handleSubmittingChange}
        onUnavailable={handleUnavailable}
      />
    </RouteDialog>
  );
}

function BorrowBody({
  missing,
  unavailable,
  onLoaded,
  onNotFound,
  onSubmittingChange,
  onUnavailable,
}: {
  readonly missing: boolean;
  readonly unavailable: boolean;
  readonly onLoaded: () => void;
  readonly onNotFound: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onUnavailable: () => void;
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
        if (controller.signal.aborted) {
          return;
        }
        setResult({ key, equipment });
        if (equipment.status === 'available') {
          onLoaded();
        } else {
          onUnavailable();
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
  }, [api, equipmentId, id, onLoaded, onNotFound, onUnavailable, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const equipment = loading ? undefined : result?.equipment;

  if (loading) {
    return (
      <div className='space-y-4' role='status' aria-label={t('status.loading')}>
        <Skeleton className='h-16 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
      </div>
    );
  }

  if (missing || unavailable) {
    return (
      <Alert variant='destructive'>
        <TriangleAlertIcon />
        <AlertTitle>
          {missing
            ? t('equipment.borrow.missingTitle')
            : t('equipment.borrow.unavailableTitle')}
        </AlertTitle>
        <AlertDescription>
          {missing
            ? t('equipment.borrow.missingDescription')
            : t('equipment.borrow.unavailableDescription')}
        </AlertDescription>
      </Alert>
    );
  }

  if (!equipment) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('equipment.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('equipment.error.forbidden')
            : t('equipment.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
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
    <div className='space-y-4'>
      <div className='rounded-lg border bg-muted/40 p-3 text-sm'>
        <div className='font-medium'>
          <span className='tabular-nums'>{equipment.assetNo}</span>
          {' · '}
          {equipment.name}
        </div>
        {equipment.category ? (
          <div className='text-muted-foreground'>{equipment.category}</div>
        ) : null}
      </div>
      <BorrowForm
        formId={FORM_ID}
        equipmentId={equipment.id}
        onSubmittingChange={onSubmittingChange}
        onNotFound={onNotFound}
        onUnavailable={onUnavailable}
        onSubmitted={() => {
          reload();
          void close();
        }}
      />
    </div>
  );
}

function BorrowFooter({
  submitting,
  ready,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
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
      {ready ? (
        <Button type='submit' form={FORM_ID} disabled={submitting}>
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {submitting
            ? t('equipment.borrow.submitting')
            : t('equipment.actions.borrow')}
        </Button>
      ) : null}
    </>
  );
}
