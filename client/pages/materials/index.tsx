/**
 * Project materials (资料).
 *
 * A contributor maintains their own materials; each has a required title and any number of
 * attachments (PNG or DOCX). Attachments are private: the list, the detail view and the byte route
 * are all scoped to the signed-in owner by the server, so a colleague holding a link sees nothing.
 *
 * Skeleton: `PageHeader` with a create action → a grid of material `Card`s → a create `Dialog` whose
 * uploaded files survive a failed save → a detail `Sheet` that previews, downloads, removes and
 * re-saves attachments → an `AlertDialog` before deleting a material.
 */
import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  FolderOpen,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  FileList,
  FileThumbnail,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
  MaterialRequestError,
  type MaterialRecord,
} from './materials-api.js';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ACCEPTED_ATTACHMENTS = [
  'image/png',
  '.png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
];

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => fileManager.repository('projectMaterialFiles'),
    [fileManager],
  );

  const [materials, setMaterials] = useState<readonly MaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createFiles, setCreateFiles] = useState<readonly FileRecord[]>([]);
  const [createUploading, setCreateUploading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<MaterialRecord | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailFiles, setDetailFiles] = useState<readonly FileRecord[]>([]);
  const [newFiles, setNewFiles] = useState<readonly FileRecord[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MaterialRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const describe = useCallback(
    (error: unknown): string => {
      if (error instanceof MaterialRequestError) {
        if (error.code === 'NOT_FOUND') return t('materials.error.notFound');
        if (error.code === 'VALIDATION') return t('materials.error.validation');
      }
      return t('materials.error.generic');
    },
    [t],
  );

  // The request reports through its callbacks rather than the effect body: a synchronous setState in an effect
  // cascades a second render before the first has painted. `reloadToken` is how the retry button asks for another
  // request without the effect owning the loading flag.
  useEffect(() => {
    let active = true;
    listMaterials(api).then(
      (items) => {
        if (!active) return;
        setMaterials(items);
        setLoadError(null);
        setLoading(false);
      },
      (error: unknown) => {
        if (!active) return;
        setLoadError(describe(error));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, describe, reloadToken]);

  const reload = (): void => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  const openCreate = (): void => {
    setCreateTitle('');
    setCreateFiles([]);
    setCreateError(null);
    setCreateOpen(true);
  };

  // A failed save leaves the dialog open with `createFiles` untouched, so filling in the missing
  // title and saving again reuses the uploads instead of asking for them a second time.
  const submitCreate = async (): Promise<void> => {
    if (!createTitle.trim()) {
      setCreateError(t('materials.titleRequired'));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createMaterial(api, {
        title: createTitle.trim(),
        fileIds: createFiles.map((file) => file.id),
      });
      setMaterials((current) => [created, ...current]);
      setCreateOpen(false);
      toaster.show({ type: 'success', title: t('materials.created') });
    } catch (error) {
      setCreateError(describe(error));
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (material: MaterialRecord): void => {
    setSelected(material);
    setDetailTitle(material.title);
    setDetailFiles(material.files);
    setNewFiles([]);
    setDetailError(null);
  };

  const submitDetail = async (): Promise<void> => {
    if (!selected) return;
    if (!detailTitle.trim()) {
      setDetailError(t('materials.titleRequired'));
      return;
    }
    setSavingDetail(true);
    setDetailError(null);
    try {
      const updated = await updateMaterial(api, selected.id, {
        title: detailTitle.trim(),
        fileIds: [...detailFiles, ...newFiles].map((file) => file.id),
      });
      setSelected(updated);
      setDetailFiles(updated.files);
      setNewFiles([]);
      setMaterials((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toaster.show({ type: 'success', title: t('materials.saved') });
    } catch (error) {
      setDetailError(describe(error));
    } finally {
      setSavingDetail(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMaterial(api, deleteTarget.id);
      setMaterials((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      if (selected?.id === deleteTarget.id) setSelected(null);
      toaster.show({ type: 'success', title: t('materials.deleted') });
      setDeleteTarget(null);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('materials.error.deleteFailed'),
        description: describe(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button type='button' onClick={openCreate}>
            <Plus aria-hidden='true' />
            {t('materials.create.action')}
          </Button>
        }
      />

      {loading ? (
        <Loading />
      ) : loadError ? (
        <Alert variant='destructive'>
          <AlertTriangle aria-hidden='true' />
          <AlertTitle>{t('materials.error.loadFailed')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>{loadError}</p>
            <Button type='button' variant='outline' size='sm' onClick={reload}>
              {t('materials.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : materials.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FolderOpen aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>{t('materials.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {materials.map((material) => (
            <li key={material.id}>
              <Card className='h-full'>
                <CardHeader>
                  <CardTitle className='break-words'>
                    {material.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='flex flex-wrap gap-2'>
                    {material.files.slice(0, 3).map((file) => (
                      <div
                        key={file.id}
                        className='h-12 w-12 overflow-hidden rounded-md border bg-muted/30'
                      >
                        <FileThumbnail file={file} />
                      </div>
                    ))}
                    {material.files.length === 0 ? (
                      <span className='text-sm text-muted-foreground'>
                        {t('materials.detail.noAttachments')}
                      </span>
                    ) : null}
                  </div>
                  <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                    <Badge variant='secondary'>
                      {t('materials.attachmentCount', {
                        count: material.files.length,
                      })}
                    </Badge>
                    <span>
                      {t('materials.updatedAt', {
                        date: new Date(material.updatedAt).toLocaleString(),
                      })}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className='gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => openDetail(material)}
                  >
                    {t('materials.open')}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    aria-label={`${t('materials.deleteLabel')}: ${material.title}`}
                    onClick={() => setDeleteTarget(material)}
                  >
                    <Trash2 aria-hidden='true' />
                    {t('materials.deleteLabel')}
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('materials.create.title')}</DialogTitle>
            <DialogDescription>
              {t('materials.create.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-6'>
            <Field>
              <FieldLabel htmlFor='material-title'>
                {t('materials.field.title')}
              </FieldLabel>
              <Input
                id='material-title'
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder={t('materials.field.titlePlaceholder')}
                aria-invalid={createError ? true : undefined}
              />
            </Field>
            <Field>
              <FieldLabel>{t('materials.field.attachments')}</FieldLabel>
              <FileUploadField
                repository={repository}
                value={createFiles}
                onChange={setCreateFiles}
                onStatusChange={(status: FileUploadStatus) =>
                  setCreateUploading(status === 'uploading')
                }
                onError={(error) => setCreateError(describe(error))}
                multiple
                accept={ACCEPTED_ATTACHMENTS}
                maxSize={MAX_ATTACHMENT_BYTES}
              />
              <p className='text-sm text-muted-foreground'>
                {t('materials.fileTypesHint')}
              </p>
            </Field>
            {createError ? <FieldError>{createError}</FieldError> : null}
            {createUploading ? (
              <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                <LoaderCircle className='animate-spin' aria-hidden='true' />
                {t('materials.uploadingHint')}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type='button'
              disabled={creating || createUploading}
              onClick={() => void submitCreate()}
            >
              {creating ? t('materials.create.submitting') : t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !savingDetail) setSelected(null);
        }}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>{t('materials.detail.title')}</SheetTitle>
            <SheetDescription>
              {t('materials.detail.description')}
            </SheetDescription>
          </SheetHeader>
          <div className='space-y-6 px-4'>
            <Field>
              <FieldLabel htmlFor='material-detail-title'>
                {t('materials.field.title')}
              </FieldLabel>
              <Input
                id='material-detail-title'
                value={detailTitle}
                onChange={(event) => setDetailTitle(event.target.value)}
                aria-invalid={detailError ? true : undefined}
              />
            </Field>
            <div className='space-y-3'>
              <h3 className='text-sm font-medium'>
                {t('materials.detail.attachments')}
              </h3>
              <FileList
                files={detailFiles}
                emptyState={
                  <p className='text-sm text-muted-foreground'>
                    {t('materials.detail.noAttachments')}
                  </p>
                }
                onRemove={(file) =>
                  setDetailFiles((current) =>
                    current.filter((item) => item.id !== file.id),
                  )
                }
                onError={(error) => setDetailError(describe(error))}
              />
              <p className='text-sm text-muted-foreground'>
                {t('materials.detail.removeHint')}
              </p>
            </div>
            <div className='space-y-3'>
              <h3 className='text-sm font-medium'>
                {t('materials.detail.addAttachments')}
              </h3>
              <FileUploadField
                repository={repository}
                value={newFiles}
                onChange={setNewFiles}
                onError={(error) => setDetailError(describe(error))}
                multiple
                accept={ACCEPTED_ATTACHMENTS}
                maxSize={MAX_ATTACHMENT_BYTES}
              />
              <p className='text-sm text-muted-foreground'>
                {t('materials.fileTypesHint')}
              </p>
            </div>
            {detailError ? <FieldError>{detailError}</FieldError> : null}
          </div>
          <SheetFooter className='flex-row justify-end gap-2 px-4'>
            <Button
              type='button'
              variant='outline'
              disabled={savingDetail}
              onClick={() => setSelected(null)}
            >
              {t('actions.close')}
            </Button>
            <Button
              type='button'
              disabled={savingDetail}
              onClick={() => void submitDetail()}
            >
              {savingDetail
                ? t('materials.detail.saving')
                : t('materials.detail.save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.delete.description', {
                title: deleteTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {t('materials.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
