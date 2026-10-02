import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

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
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FileList } from '@/extensions/nocobase-file-component-ui';
import {
  deleteMaterial,
  getMaterial,
  materialErrorCode,
  materialErrorKey,
  updateMaterial,
  type Material,
} from './api.js';
import { MaterialEditor } from './editor.js';

export default function MaterialDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const { id } = useParams();

  const [material, setMaterial] = useState<Material>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [errorKey, setErrorKey] = useState<string>('materials.errors.unknown');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setErrorKey('materials.errors.notFound');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      setMaterial(await getMaterial(api, id));
      setStatus('ready');
    } catch (error) {
      setErrorKey(materialErrorKey(materialErrorCode(error)));
      setStatus('error');
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
  };

  const remove = async (): Promise<void> => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteMaterial(api, id);
      toaster.show({
        type: 'success',
        title: t('materials.detail.deletedTitle'),
        description: t('materials.detail.deletedDescription'),
      });
      void navigate('/materials', { replace: true });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('materials.detail.deleteFailed'),
        description: t(materialErrorKey(materialErrorCode(error))),
      });
      setDeleting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={material?.title ?? t('materials.detail.title')}
        description={
          material
            ? t('materials.detail.createdAt', {
                date: formatDate(material.createdAt),
              })
            : undefined
        }
        actions={
          <>
            <Button variant='outline' render={<Link to='/materials' />}>
              <ArrowLeftIcon data-icon='inline-start' />
              {t('materials.detail.back')}
            </Button>
            {material && !editing ? (
              <>
                <Button
                  variant='outline'
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon data-icon='inline-start' />
                  {t('materials.detail.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={<Button variant='destructive' />}
                  >
                    <Trash2Icon data-icon='inline-start' />
                    {t('materials.detail.delete')}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('materials.detail.deleteTitle')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('materials.detail.deleteDescription', {
                          title: material.title,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>
                        {t('actions.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant='destructive'
                        disabled={deleting}
                        onClick={() => void remove()}
                      >
                        {deleting
                          ? t('materials.detail.deleting')
                          : t('materials.detail.deleteConfirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </>
        }
      />

      {status === 'loading' ? (
        <div className='flex justify-center py-16'>
          <Loading label={t('materials.detail.loading')} />
        </div>
      ) : null}

      {status === 'error' ? (
        <Alert variant='destructive'>
          <AlertCircleIcon aria-hidden='true' />
          <AlertDescription className='flex flex-col gap-3'>
            <span>{t(errorKey)}</span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='self-start'
              render={<Link to='/materials' />}
            >
              {t('materials.detail.back')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === 'ready' && material ? (
        editing ? (
          <MaterialEditor
            initialTitle={material.title}
            initialFiles={material.files}
            submitLabel={t('materials.detail.save')}
            busyLabel={t('materials.detail.saving')}
            onCancel={() => setEditing(false)}
            onSubmit={async ({ title, fileIds }) => {
              const updated = await updateMaterial(api, material.id, {
                title,
                fileIds,
              });
              setMaterial(updated);
              setEditing(false);
              toaster.show({
                type: 'success',
                title: t('materials.detail.savedTitle'),
                description: t('materials.detail.savedDescription'),
              });
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {t('materials.detail.attachmentsTitle')}
              </CardTitle>
              <CardDescription>
                {t('materials.detail.attachmentsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileList
                files={material.files}
                emptyState={
                  <div className='flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                    <PaperclipIcon aria-hidden='true' />
                    {t('materials.detail.noAttachments')}
                  </div>
                }
                onError={(error) =>
                  toaster.show({
                    type: 'error',
                    title: t('materials.detail.previewFailed'),
                    description: t(
                      materialErrorKey(materialErrorCode(error)),
                    ),
                  })
                }
              />
            </CardContent>
          </Card>
        )
      ) : null}
    </PageContainer>
  );
}