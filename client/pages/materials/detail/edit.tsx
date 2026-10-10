import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { MaterialForm } from '../material-form.js';
import { fetchMaterial } from '../materials-api.js';
import type { Material, MaterialDetailOutletContext } from '../types.js';

const FORM_ID = 'material-edit-form';

/**
 * The edit dialog, stacked on the material drawer.
 *
 * It loads the record by id before rendering the form rather than trusting the
 * drawer's copy, so the form always edits the latest attachments. A `404` on
 * load or on save means the material was deleted elsewhere: it refreshes the
 * list behind and closes.
 */
export default function EditMaterialPage(): ReactElement {
  const { materialId = '' } = useParams();
  return <EditMaterial key={materialId} materialId={materialId} />;
}

function EditMaterial({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The state disables the buttons; the ref lets `beforeClose` read the latest
  // value before the state change has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    fetchMaterial(api, materialId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, material: data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const material = loading ? undefined : result?.material;
  const gone = status === 404 || status === 403;
  const reload = () => setReloadCount((current) => current + 1);

  let body: ReactElement;
  let footer: ReactElement;
  if (loading) {
    body = (
      <div
        role='status'
        className='flex items-center gap-2 text-muted-foreground'
      >
        <Spinner aria-hidden='true' />
        {t('status.loading')}
      </div>
    );
    footer = <CloseOnly />;
  } else if (gone) {
    body = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertDescription>{t('materials.error.notFound')}</AlertDescription>
      </Alert>
    );
    footer = <CloseOnly />;
  } else if (error || !material) {
    body = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertDescription role='alert'>
          {t('materials.loadFailed')}
        </AlertDescription>
        <Button variant='outline' size='sm' onClick={reload}>
          {t('status.retry')}
        </Button>
      </Alert>
    );
    footer = <CloseOnly />;
  } else {
    body = (
      <EditMaterialBody
        material={material}
        onSubmittingChange={handleSubmittingChange}
      />
    );
    footer = <EditFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('materials.edit.title')}
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// `useRouteOverlay()` and the drawer's outlet context are only available to a
// component rendered inside the overlay, so the form gets its own wrapper.
function EditMaterialBody({
  material,
  onSubmittingChange,
}: {
  readonly material: Material;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reloadMaterial, reloadList } =
    useOutletContext<MaterialDetailOutletContext>();
  return (
    <MaterialForm
      formId={FORM_ID}
      material={material}
      onSubmittingChange={onSubmittingChange}
      onNotFound={() => {
        reloadList();
        void close();
      }}
      onSubmitted={() => {
        reloadMaterial();
        reloadList();
        void close();
      }}
    />
  );
}

function EditFooter({
  submitting,
}: {
  readonly submitting: boolean;
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
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseOnly(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
