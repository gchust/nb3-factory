import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RouteDialog } from '@/components/route-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { MaterialForm } from './material-form.js';
import type { Material, MaterialEditOutletContext } from './types.js';
import { toMaterialId } from './types.js';

export interface MaterialDialogProps {
  /** Present when editing; omitted when creating. */
  readonly materialId?: string;
}

/**
 * Create and edit as an URL-addressable dialog. It loads the latest record
 * before rendering the form and reports a record that disappeared between
 * loading and saving instead of letting the user submit it again.
 */
export function MaterialDialog({
  materialId,
}: MaterialDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload, onSaved } = useOutletContext<MaterialEditOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [savedNotFound, setSavedNotFound] = useState(false);
  const requestKey = `${materialId ?? 'new'}:${reloadCount}`;
  const id = toMaterialId(materialId);

  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material | null;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // No id opens the create form; an unusable id cannot name a row.
    if (materialId === undefined || id === null) return;
    const controller = new AbortController();
    const key = requestKey;
    api
      .repository<Material>('materials')
      .findOne({ filter: { id } })
      .then(
        (material) => {
          if (!controller.signal.aborted)
            setResult({ key, material: material ?? null });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, id, materialId, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const loading =
    materialId !== undefined && id !== null && current === undefined;
  const loadError = current?.error;
  const missing =
    savedNotFound ||
    (materialId !== undefined && (id === null || current?.material === null));
  const material = current?.material ?? undefined;
  const showForm = !loading && !loadError && !missing;

  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const handleNotFound = () => {
    setSavedNotFound(true);
    reload();
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      description={
        materialId
          ? t('materials.edit.description')
          : t('materials.create.description')
      }
      footer={
        <MaterialDialogFooter
          formId={dialogFormId(materialId)}
          showSave={showForm}
          submitting={submitting}
        />
      }
      title={
        materialId ? t('materials.edit.title') : t('materials.create.title')
      }
    >
      {loading ? (
        <div className='flex justify-center p-6'>
          <Spinner className='size-6' />
        </div>
      ) : null}

      {loadError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.error.title')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>{t('materials.error.requestFailed')}</p>
            <Button
              onClick={() => setReloadCount((count) => count + 1)}
              size='sm'
              variant='outline'
            >
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {missing ? (
        <Alert>
          <AlertTitle>{t('materials.error.notFoundTitle')}</AlertTitle>
          <AlertDescription>{t('materials.error.notFound')}</AlertDescription>
        </Alert>
      ) : null}

      {showForm ? (
        <MaterialDialogBody
          formId={dialogFormId(materialId)}
          material={material}
          onNotFound={handleNotFound}
          onSaved={onSaved}
          onSubmittingChange={handleSubmittingChange}
          reload={reload}
        />
      ) : null}
    </RouteDialog>
  );
}

/** Form ids stay unique when the edit dialog stacks on the detail drawer. */
function dialogFormId(materialId: string | undefined): string {
  return materialId ? `material-edit-${materialId}-form` : 'material-new-form';
}

/**
 * The form and its success handling live inside the overlay, so they can call
 * `useRouteOverlay()` and close the layer they belong to.
 */
function MaterialDialogBody({
  formId,
  material,
  onNotFound,
  onSaved,
  onSubmittingChange,
  reload,
}: {
  readonly formId: string;
  readonly material?: Material;
  readonly onNotFound: () => void;
  readonly onSaved?: (material: Material) => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const { close } = useRouteOverlay();

  return (
    <MaterialForm
      formId={formId}
      material={material}
      onNotFound={onNotFound}
      onSubmitted={(record) => {
        toaster.show({
          type: 'success',
          title: material
            ? t('materials.edit.success')
            : t('materials.create.success'),
        });
        onSaved?.(record);
        reload();
        void close();
      }}
      onSubmittingChange={onSubmittingChange}
    />
  );
}

function MaterialDialogFooter({
  formId,
  showSave,
  submitting,
}: {
  readonly formId: string;
  readonly showSave: boolean;
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();

  if (!showSave) {
    return (
      <Button
        disabled={isClosing}
        onClick={() => void close()}
        variant='outline'
      >
        {t('actions.close')}
      </Button>
    );
  }

  return (
    <>
      <Button
        disabled={isClosing || submitting}
        onClick={() => void close()}
        variant='outline'
      >
        {t('actions.cancel')}
      </Button>
      <Button disabled={isClosing || submitting} form={formId} type='submit'>
        {submitting ? <Spinner /> : null}
        {t('actions.save')}
      </Button>
    </>
  );
}
