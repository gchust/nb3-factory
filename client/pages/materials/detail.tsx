import {
  useApiClient,
  useService,
  useToaster,
  type ToastOptions,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import type { MaterialRecord } from './api';
import {
  MATERIAL_ACCEPT,
  MATERIAL_FILES_RESOURCE,
  destroyMaterial,
  getMaterial,
  materialErrorKey,
  updateMaterial,
} from './api';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

/**
 * One material: its title, its attachments, and the actions that maintain it.
 *
 * Removing an attachment only drops it from `files`; the list is written back
 * when Save is pressed. That is what makes removal a detach on save rather than
 * an immediate delete, and it is why an accidental click is recoverable by
 * navigating away.
 */
export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository: ClientFileRepository = useMemo(
    () => manager.repository(MATERIAL_FILES_RESOURCE),
    [manager],
  );

  const { id } = useParams<{ id: string }>();
  const materialId = Number(id);
  const invalidId = !Number.isSafeInteger(materialId) || materialId <= 0;

  const [material, setMaterial] = useState<MaterialRecord>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const notifyError = useCallback(
    (key: string) => {
      const options: ToastOptions = { type: 'error', title: t(key) };
      toaster.show(options);
    },
    [t, toaster],
  );

  const applyMaterial = useCallback((record: MaterialRecord) => {
    setMaterial(record);
    setTitle(record.title);
    setFiles(record.files);
  }, []);

  // State is only written after the request resolves, so the effect body does
  // not trigger a synchronous re-render.
  useEffect(() => {
    if (invalidId) return undefined;
    let active = true;
    void (async () => {
      try {
        const record = await getMaterial(api, materialId);
        if (!active) return;
        if (record) {
          applyMaterial(record);
        } else {
          setMissing(true);
        }
      } catch {
        if (active) setMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, applyMaterial, invalidId, materialId]);

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(t('materials.errors.titleRequired'));
      return;
    }
    setTitleError(undefined);
    setSaving(true);
    try {
      const updated = await updateMaterial(api, materialId, {
        title: trimmed,
        fileIds: files.map((file) => file.id),
      });
      if (!updated) {
        setMissing(true);
        return;
      }
      applyMaterial(updated);
      toaster.show({ type: 'success', title: t('materials.saved') });
    } catch (error) {
      notifyError(materialErrorKey(error));
    }
    setSaving(false);
  };

  const remove = async (): Promise<void> => {
    setDeleting(true);
    try {
      const removed = await destroyMaterial(api, materialId);
      if (!removed) {
        setMissing(true);
        return;
      }
      toaster.show({ type: 'success', title: t('materials.deleted') });
      await navigate('/materials');
    } catch (error) {
      notifyError(materialErrorKey(error));
    }
    setDeleting(false);
  };

  if (invalidId || (!loading && (missing || !material))) {
    return (
      <PageContainer>
        <Alert variant='destructive' role='alert'>
          <AlertDescription>{t('materials.notFound')}</AlertDescription>
        </Alert>
        <Button variant='outline' render={<Link to='/materials' />}>
          {t('materials.backToList')}
        </Button>
      </PageContainer>
    );
  }

  if (loading || !material) {
    return (
      <PageContainer>
        <p role='status' className='text-sm text-muted-foreground'>
          {t('status.loading')}
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={material.title}
        description={t('materials.detailDescription')}
        actions={
          <Button variant='outline' render={<Link to='/materials' />}>
            {t('materials.backToList')}
          </Button>
        }
      />

      <form
        onSubmit={(event) => void save(event)}
        noValidate
        className='space-y-6'
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('materials.detailsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor='material-detail-title'>
                {t('materials.titleLabel')}
              </FieldLabel>
              <Input
                id='material-detail-title'
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) setTitleError(undefined);
                }}
                aria-invalid={Boolean(titleError)}
                autoComplete='off'
              />
              {titleError ? (
                <FieldError>{titleError}</FieldError>
              ) : (
                <FieldDescription>
                  {t('materials.titleDescription')}
                </FieldDescription>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('materials.attachmentsLabel')}</CardTitle>
            <CardDescription>{t('materials.removeNote')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <FileList
              files={files}
              onRemove={(file) =>
                setFiles((current) =>
                  current.filter((candidate) => candidate.id !== file.id),
                )
              }
              onError={() => notifyError('materials.errors.downloadFailed')}
              emptyState={t('materials.emptyAttachments')}
            />
            <Field>
              <FieldLabel>{t('materials.addAttachmentsLabel')}</FieldLabel>
              <FileUploadField
                repository={repository}
                value={files}
                onChange={setFiles}
                multiple
                accept={MATERIAL_ACCEPT}
                maxSize={MAX_ATTACHMENT_BYTES}
                maxFiles={MAX_ATTACHMENTS}
                removeOnDelete={false}
                onStatusChange={(status) =>
                  setUploading(status === 'uploading')
                }
                onError={() => notifyError('materials.errors.uploadFailed')}
              />
              <FieldDescription>
                {t('materials.attachmentsDescription')}
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <div className='flex items-center justify-between gap-3'>
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button type='button' variant='destructive' />}
            >
              {t('materials.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('materials.deleteTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('materials.deleteDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  {deleting ? t('materials.deleting') : t('actions.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type='submit' disabled={saving || uploading}>
            {saving ? t('materials.saving') : t('materials.save')}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
