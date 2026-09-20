import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  cancelBorrow,
  deleteMaterial,
  errorCode,
  fileContentUrl,
  getMaterial,
  listSelectableUsers,
  requestBorrow,
  updateMaterial,
  type MaterialDetailDto,
  type MaterialFileDto,
  type MaterialFormValues,
  type SelectableUserDto,
} from './api.js';
import {
  Alert,
  Badge,
  ConfirmDialog,
  FilePreviewDialog,
  StatusBadge,
} from './components.js';
import { formatDateTime } from './format.js';
import { MaterialFiles } from './file-manager.js';
import { MaterialFormDialog } from './material-form.js';

export default function LibraryDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const params = useParams();
  const id = Number(params.id);

  const [material, setMaterial] = useState<MaterialDetailDto | null>(null);
  const [users, setUsers] = useState<readonly SelectableUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<MaterialFileDto | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getMaterial(api, id);
      setMaterial(detail);
      if (detail.canManage) {
        setUsers(await listSelectableUsers(api));
      }
    } catch (cause) {
      setError(
        errorCode(cause) === 'FORBIDDEN'
          ? t('library.noPermission')
          : t('library.notFound'),
      );
      setMaterial(null);
    } finally {
      setLoading(false);
    }
  }, [api, id, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!Number.isInteger(id) || id <= 0) {
        if (active) {
          setError(t('library.notFound'));
          setLoading(false);
        }
        return;
      }
      try {
        const detail = await getMaterial(api, id);
        if (!active) return;
        setMaterial(detail);
        if (detail.canManage) {
          const list = await listSelectableUsers(api);
          if (active) setUsers(list);
        }
      } catch (cause) {
        if (!active) return;
        setError(
          errorCode(cause) === 'FORBIDDEN'
            ? t('library.noPermission')
            : t('library.notFound'),
        );
        setMaterial(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, id, t]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setMaterial(await getMaterial(api, id));
    } catch {
      // Keep the previous view; a transient refresh failure is not fatal.
    }
  }, [api, id]);

  const borrow = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await requestBorrow(api, id);
      await refresh();
    } catch (cause) {
      const code = errorCode(cause);
      setActionError(
        code === 'NOT_BORROWABLE'
          ? t('library.error.notBorrowable')
          : code === 'FORBIDDEN'
            ? t('library.error.forbidden')
            : t('library.error.generic'),
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!material?.myActiveBorrowing) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelBorrow(api, material.myActiveBorrowing.id);
      await refresh();
    } catch {
      setActionError(t('library.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const save = async (values: MaterialFormValues): Promise<void> => {
    await updateMaterial(api, id, values);
    await load();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await deleteMaterial(api, id);
      void navigate('/library');
    } catch {
      setActionError(t('library.error.generic'));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <Breadcrumbs />
        <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      </PageContainer>
    );
  }

  if (!material) {
    return (
      <PageContainer className='mx-auto max-w-4xl'>
        <Breadcrumbs />
        <Alert tone='error'>{error ?? t('library.notFound')}</Alert>
        <Link className='text-sm text-primary hover:underline' to='/library'>
          {t('library.backToList')}
        </Link>
      </PageContainer>
    );
  }

  const active = material.myActiveBorrowing;

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <Breadcrumbs />
      <PageHeader
        actions={
          material.canManage ? (
            <>
              <Button onClick={() => setEditing(true)} variant='outline'>
                <Pencil />
                {t('library.edit')}
              </Button>
              <Button
                onClick={() => setConfirmDelete(true)}
                variant='destructive'
              >
                <Trash2 />
                {t('library.delete')}
              </Button>
            </>
          ) : null
        }
        title={material.title}
      />

      <Link
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        to='/library'
      >
        <ArrowLeft className='size-4' />
        {t('library.backToList')}
      </Link>

      <div className='grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]'>
        <div className='overflow-hidden rounded-xl border border-border bg-muted'>
          {material.coverFileId ? (
            <img
              alt={material.title}
              className='aspect-[4/3] w-full object-cover'
              src={fileContentUrl(material.coverFileId)}
            />
          ) : (
            <div className='grid aspect-[4/3] place-items-center text-sm text-muted-foreground'>
              {t('library.noCover')}
            </div>
          )}
        </div>

        <dl className='grid content-start gap-3 text-sm sm:grid-cols-2'>
          <Meta label={t('library.form.category')}>
            {material.category || '—'}
          </Meta>
          <Meta label={t('library.form.owner')}>{material.owner || '—'}</Meta>
          <Meta label={t('library.form.visibility')}>
            <Badge tone={material.visibility === 'all' ? 'muted' : 'warning'}>
              {t(`library.visibility.${material.visibility}`)}
            </Badge>
          </Meta>
          <Meta label={t('library.availabilityLabel')}>
            {material.borrowable
              ? t('library.availability', {
                  available: material.availableCopies,
                  total: material.totalCopies,
                })
              : t('library.notBorrowable')}
          </Meta>
          <Meta label={t('library.updatedAt')}>
            {formatDateTime(material.updatedAt)}
          </Meta>
          <Meta label={t('library.files')}>
            {t('library.fileCount', { count: material.fileCount })}
          </Meta>
        </dl>
      </div>

      <section className='space-y-1'>
        <h2 className='font-heading text-lg font-medium'>
          {t('library.summary')}
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          {material.summary || t('library.summaryEmpty')}
        </p>
      </section>

      <section className='space-y-2 rounded-lg border border-border p-4'>
        <h2 className='font-heading text-lg font-medium'>
          {t('library.borrowSection')}
        </h2>
        {material.canManage ? (
          <p className='text-sm text-muted-foreground'>
            {t('library.adminBorrowHint')}
          </p>
        ) : active ? (
          <div className='flex items-center gap-3'>
            <StatusBadge status={active.status} />
            <span className='text-sm text-muted-foreground'>
              {t('library.requestedAt', {
                time: formatDateTime(active.requestedAt),
              })}
            </span>
            {active.status === 'pending' ? (
              <Button
                disabled={busy}
                onClick={() => void cancel()}
                size='sm'
                variant='outline'
              >
                {t('library.cancelRequest')}
              </Button>
            ) : null}
          </div>
        ) : material.borrowable ? (
          <div className='space-y-2'>
            <Button disabled={busy} onClick={() => void borrow()} size='sm'>
              {busy ? <Spinner /> : null}
              {t('library.borrowApply')}
            </Button>
            {material.availableCopies <= 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('library.noStockHint')}
              </p>
            ) : null}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('library.notBorrowable')}
          </p>
        )}
        {actionError ? <Alert tone='error'>{actionError}</Alert> : null}
      </section>

      <MaterialFiles
        api={api}
        material={material}
        onPreview={setPreview}
        onRefresh={refresh}
      />

      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />

      {editing ? (
        <MaterialFormDialog
          initial={material}
          onClose={() => setEditing(false)}
          onSubmit={save}
          users={users}
        />
      ) : null}

      <ConfirmDialog
        busy={busy}
        confirmLabel={t('library.delete')}
        description={t('library.deleteConfirm', { title: material.title })}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        open={confirmDelete}
        title={t('library.deleteTitle')}
      />
    </PageContainer>
  );
}

function Meta({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}
