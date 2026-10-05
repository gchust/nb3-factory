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
import { Link, useNavigate } from 'react-router';

import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import type { MaterialRecord } from './api';
import {
  MATERIAL_ACCEPT,
  MATERIAL_FILES_RESOURCE,
  createMaterial,
  listMaterials,
  materialErrorKey,
} from './api';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

/**
 * The materials workspace: create a titled material with its attachments, and
 * see the caller's own materials below. Every query is owner-scoped by the
 * server, so this page never asks for somebody else's records and never
 * receives them.
 *
 * The create form is deliberately on this page rather than behind a separate
 * "New" step, because an upload happens before the material exists: the file
 * records are already stored when the form is submitted, so a save refused for
 * a missing title keeps them and a later submit links the same files instead of
 * uploading again.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository: ClientFileRepository = useMemo(
    () => manager.repository(MATERIAL_FILES_RESOURCE),
    [manager],
  );

  const [materials, setMaterials] = useState<readonly MaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const notifyError = useCallback(
    (key: string) => {
      const options: ToastOptions = { type: 'error', title: t(key) };
      toaster.show(options);
    },
    [t, toaster],
  );

  // The list is loaded once when the page mounts and again whenever the user
  // returns to it. State is written in the promise callbacks, never
  // synchronously in the effect body.
  useEffect(() => {
    let active = true;
    listMaterials(api)
      .then((records) => {
        if (!active) return;
        setMaterials(records);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      // The files already uploaded stay in state; only the save is refused, so
      // entering a title and submitting again reuses them.
      setTitleError(t('materials.errors.titleRequired'));
      return;
    }
    setTitleError(undefined);
    setSaving(true);
    try {
      const created = await createMaterial(api, {
        title: trimmed,
        fileIds: files.map((file) => file.id),
      });
      setTitle('');
      setFiles([]);
      toaster.show({ type: 'success', title: t('materials.created') });
      await navigate(`/materials/${created.id}`);
    } catch (error) {
      notifyError(materialErrorKey(error));
    }
    setSaving(false);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('materials.newTitle')}</CardTitle>
          <CardDescription>{t('materials.newDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void submit(event)}
            noValidate
            className='space-y-6'
          >
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor='material-title'>
                {t('materials.titleLabel')}
              </FieldLabel>
              <Input
                id='material-title'
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) setTitleError(undefined);
                }}
                placeholder={t('materials.titlePlaceholder')}
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

            <Field>
              <FieldLabel>{t('materials.attachmentsLabel')}</FieldLabel>
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

            <div className='flex justify-end'>
              <Button type='submit' disabled={saving || uploading}>
                {saving ? t('materials.creating') : t('materials.create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('materials.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('status.loading')}
            </p>
          ) : loadFailed ? (
            <Alert variant='destructive' role='alert'>
              <AlertDescription>
                {t('materials.errors.loadFailed')}
              </AlertDescription>
            </Alert>
          ) : materials.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('materials.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('materials.title')}</TableHead>
                  <TableHead>{t('materials.attachments')}</TableHead>
                  <TableHead>{t('materials.createdAt')}</TableHead>
                  <TableHead className='text-right'>
                    {t('materials.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className='font-medium'>
                      {material.title}
                    </TableCell>
                    <TableCell>
                      {t('materials.attachmentCount', {
                        count: material.files.length,
                      })}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {String(material.createdAt).slice(0, 10)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='outline'
                        size='sm'
                        render={<Link to={`/materials/${material.id}`} />}
                      >
                        {t('materials.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
