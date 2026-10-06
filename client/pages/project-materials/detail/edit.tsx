import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { fetchMaterial } from '../api.js';
import { ProjectMaterialForm } from '../project-material-form.js';
import type {
  ProjectMaterial,
  ProjectMaterialDetailOutletContext,
} from '../types.js';

const FORM_ID = 'project-material-edit-form';

/** Route `/project-materials/:materialId/edit`: edit in a dialog stacked on the detail drawer. */
export default function EditProjectMaterialPage(): ReactElement {
  const { materialId = '' } = useParams();
  return <EditProjectMaterial key={materialId} materialId={materialId} />;
}

function EditProjectMaterial({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Callbacks the detail drawer passes down through <Outlet context>.
  const { onNotFound } = useOutletContext<ProjectMaterialDetailOutletContext>();

  // The state disables the buttons; the ref is what `beforeClose` reads.
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest record on open instead of trusting the drawer's snapshot.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: ProjectMaterial;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    fetchMaterial(api, materialId, controller.signal).then(
      (material) => {
        if (!controller.signal.aborted) setResult({ key, material });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        if (error instanceof ApiClientError && error.status === 404) {
          onNotFound();
        }
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  // A 404 on save also means the record does not exist.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const material = loading ? undefined : result?.material;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    // No "Retry": neither case will succeed on a second try.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('projectMaterials.error.notFound')
            : t('projectMaterials.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('projectMaterials.error.requestFailed')}
        </AlertDescription>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setReloadCount((count) => count + 1)}
        >
          {t('status.retry')}
        </Button>
      </Alert>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!material) {
    body = (
      <div
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
        role='status'
      >
        {['title', 'attachments'].map((field) => (
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
      <EditProjectMaterialBody
        material={material}
        onSubmittingChange={handleSubmittingChange}
        onUploadingChange={setUploading}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
        }}
      />
    );
    footer = <EditProjectMaterialFooter submitting={submitting || uploading} />;
  }

  return (
    <RouteDialog
      title={t('projectMaterials.edit.title')}
      description={t('projectMaterials.edit.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// `useRouteOverlay()` only works inside the dialog, so the body and footer get
// their own components.
function EditProjectMaterialBody({
  material,
  onSubmittingChange,
  onUploadingChange,
  onNotFound,
}: {
  readonly material: ProjectMaterial;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onUploadingChange: (uploading: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<ProjectMaterialDetailOutletContext>();
  return (
    <ProjectMaterialForm
      formId={FORM_ID}
      material={material}
      onSubmittingChange={onSubmittingChange}
      onUploadingChange={onUploadingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // Update the drawer with the record the endpoint returned, then close.
        onSaved(saved);
        void close();
      }}
    />
  );
}

function EditProjectMaterialFooter({
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
        {submitting ? t('actions.saving') : t('projectMaterials.edit.submit')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled = false,
}: {
  readonly label?: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label ?? t('actions.close')}
    </Button>
  );
}
