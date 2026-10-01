import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { SaveIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import {
  FileList,
  FileUploadField,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

import { deleteMaterial, getMaterial, updateMaterial } from './api.js';
import {
  MATERIAL_ACCEPT,
  MATERIAL_MAX_SIZE,
  useMaterialFileRepository,
} from './files.js';

/** A stable empty value: the upload field only ever holds files already merged into the draft. */
const NO_FILES: readonly FileRecord[] = [];

export interface MaterialDetailSheetProps {
  readonly materialId: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => void;
  readonly onDeleted: () => void;
}

type LoadState = 'loading' | 'missing' | 'error' | 'ready';

/**
 * The material detail view. It loads the material by id, so it always shows the
 * stored record rather than the list row that opened it.
 *
 * Removal is staged: the attachment leaves the draft here and only the save
 * sends the changed id list. The server then detaches it, which keeps the
 * stored bytes and makes an accidental removal reversible until the user saves.
 */
export function MaterialDetailSheet({
  materialId,
  onOpenChange,
  onChanged,
  onDeleted,
}: MaterialDetailSheetProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const repository = useMaterialFileRepository();
  const toaster = useToaster();
  const [result, setResult] = useState<{
    readonly key: string;
    readonly state: LoadState;
  }>();
  const [saved, setSaved] = useState<{
    readonly title: string;
    readonly files: readonly FileRecord[];
  }>({ title: '', files: [] });
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [titleError, setTitleError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!materialId) return undefined;
    const controller = new AbortController();
    const key = materialId;
    getMaterial(api, key, controller.signal).then(
      (material) => {
        if (controller.signal.aborted) return;
        setTitleError(undefined);
        setFormError(undefined);
        if (!material) {
          setResult({ key, state: 'missing' });
          return;
        }
        setResult({ key, state: 'ready' });
        setSaved({ title: material.title, files: material.files });
        setTitle(material.title);
        setFiles(material.files);
      },
      () => {
        if (!controller.signal.aborted) setResult({ key, state: 'error' });
      },
    );
    return () => controller.abort();
  }, [api, materialId]);

  // The result belongs to the id that produced it: a stale response never renders as the open material.
  const load: LoadState =
    result && result.key === materialId ? result.state : 'loading';

  const addFiles = (next: readonly FileRecord[]): void => {
    setFiles((current) => {
      const known = new Set(current.map((file) => file.id));
      return [...current, ...next.filter((file) => !known.has(file.id))];
    });
  };

  const dirty =
    load === 'ready' &&
    (title.trim() !== saved.title.trim() ||
      files.length !== saved.files.length ||
      files.some((file) => !saved.files.some((other) => other.id === file.id)));

  const save = async (): Promise<void> => {
    if (!materialId) return;
    const value = title.trim();
    if (!value) {
      setTitleError(t('materials.errors.titleRequired'));
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      const material = await updateMaterial(api, materialId, {
        title: value,
        fileIds: files.map((file) => file.id),
      });
      if (!material) {
        setResult({ key: materialId, state: 'missing' });
        return;
      }
      setSaved({ title: material.title, files: material.files });
      setResult({ key: materialId, state: 'ready' });
      setTitle(material.title);
      setFiles(material.files);
      toaster.show({ type: 'success', title: t('materials.notices.saved') });
      onChanged();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === 'VALIDATION_TITLE_REQUIRED'
      ) {
        setTitleError(t('materials.errors.titleRequired'));
      } else {
        setFormError(t('materials.errors.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!materialId) return;
    setDeleting(true);
    try {
      await deleteMaterial(api, materialId);
      toaster.show({ type: 'success', title: t('materials.notices.deleted') });
      setConfirmDelete(false);
      onDeleted();
      onOpenChange(false);
    } catch {
      setFormError(t('materials.errors.deleteFailed'));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={Boolean(materialId)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{t('materials.detailTitle')}</SheetTitle>
          <SheetDescription>
            {t('materials.detailDescription')}
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-6 px-4 pb-6'>
          {load === 'loading' ? (
            <div className='space-y-3'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-24 w-full' />
            </div>
          ) : null}
          {load === 'missing' ? (
            <Alert variant='destructive'>
              <TriangleAlertIcon aria-hidden='true' />
              <AlertDescription>
                {t('materials.errors.notFound')}
              </AlertDescription>
            </Alert>
          ) : null}
          {load === 'error' ? (
            <Alert variant='destructive'>
              <TriangleAlertIcon aria-hidden='true' />
              <AlertDescription>
                {t('materials.errors.loadFailed')}
              </AlertDescription>
            </Alert>
          ) : null}
          {load === 'ready' ? (
            <>
              {formError ? (
                <Alert variant='destructive'>
                  <TriangleAlertIcon aria-hidden='true' />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={titleError ? true : undefined}>
                <FieldLabel htmlFor='material-detail-title'>
                  {t('materials.titleLabel')}
                </FieldLabel>
                <Input
                  id='material-detail-title'
                  value={title}
                  aria-invalid={titleError ? true : undefined}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (titleError) setTitleError(undefined);
                  }}
                />
                {titleError ? <FieldError>{titleError}</FieldError> : null}
              </Field>
              <div className='space-y-3'>
                <h3 className='text-sm font-medium'>
                  {t('materials.attachments')}
                </h3>
                <FileList
                  files={files}
                  labels={{
                    empty: t('materials.noAttachments'),
                    preview: t('materials.preview'),
                    download: t('materials.download'),
                    remove: t('materials.remove'),
                  }}
                  onRemove={(file) => {
                    setFiles((current) =>
                      current.filter((candidate) => candidate.id !== file.id),
                    );
                  }}
                  onError={(error) => {
                    toaster.show({
                      type: 'error',
                      title: t('materials.errors.uploadRejected'),
                      description: error.message,
                    });
                  }}
                />
                <FileUploadField
                  repository={repository}
                  value={NO_FILES}
                  onChange={addFiles}
                  multiple
                  accept={MATERIAL_ACCEPT}
                  maxSize={MATERIAL_MAX_SIZE}
                  labels={{
                    choose: t('materials.addAttachments'),
                    remove: t('materials.remove'),
                  }}
                  onStatusChange={(status) =>
                    setUploading(status === 'uploading')
                  }
                  onError={(error) => {
                    toaster.show({
                      type: 'error',
                      title: t('materials.errors.uploadRejected'),
                      description: error.message,
                    });
                  }}
                />
              </div>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-sm text-muted-foreground'>
                  {dirty ? t('materials.unsavedChanges') : null}
                </span>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='destructive'
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving || deleting}
                  >
                    <Trash2Icon aria-hidden='true' />
                    {t('materials.delete')}
                  </Button>
                  <Button
                    type='button'
                    onClick={() => void save()}
                    disabled={saving || uploading || !dirty}
                  >
                    <SaveIcon aria-hidden='true' />
                    {saving ? t('materials.saving') : t('materials.save')}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {t('materials.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
