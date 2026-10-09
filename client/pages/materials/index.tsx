import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { MaterialsAssistant } from './materials-assistant.js';
import type { Material, MaterialsOutletContext } from './types.js';
import { MATERIALS_RESOURCE_ID } from './types.js';

const LIST_LIMIT = 100;

/**
 * The materials page: read the materials a signed-in colleague may see on one
 * side, ask the read-only assistant about them on the other. Which rows exist
 * is decided by the server's record-level access rule, so the list and the
 * assistant's answers draw on exactly the same set.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly materials?: Material[];
    readonly error?: unknown;
  }>();
  const requestKey = String(reloadCount);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const canCreate = useCan({
    resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
    action: 'create',
  });

  useEffect(() => {
    const controller = new AbortController();
    const key = requestKey;
    api
      .repository<Material>('materials')
      .findMany({
        limit: LIST_LIMIT,
        sort: (sort) => sort.field('id').asc(),
      })
      .then(
        (materials) => {
          if (!controller.signal.aborted) setResult({ key, materials });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const materials = current?.materials;
  const error = current?.error;

  const outletContext = useMemo<MaterialsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate.can ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('materials.create.action')}
            </Button>
          ) : undefined
        }
        description={t('materials.description')}
        title={t('materials.title')}
      />

      <div className='grid items-start gap-6 lg:grid-cols-2'>
        <section className='space-y-2'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('materials.assistant.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('materials.assistant.description')}
          </p>
          <MaterialsAssistant />
        </section>

        <section className='space-y-2'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('materials.list.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('materials.list.description')}
          </p>
          <MaterialList
            error={error}
            loading={materials === undefined && error === undefined}
            materials={materials}
            onReload={reload}
            onRetry={reload}
          />
        </section>
      </div>

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function MaterialList({
  error,
  loading,
  materials,
  onReload,
  onRetry,
}: {
  readonly error: unknown;
  readonly loading: boolean;
  readonly materials?: Material[];
  readonly onReload: () => void;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-20 w-full' />
      </div>
    );
  }

  if (error) {
    const sessionExpired =
      error instanceof ApiClientError && error.status === 401;
    const forbidden = error instanceof ApiClientError && error.status === 403;
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('materials.error.title')}</AlertTitle>
        <AlertDescription className='space-y-3'>
          <p>
            {sessionExpired
              ? t('materials.error.sessionExpired')
              : forbidden
                ? t('materials.error.forbidden')
                : t('materials.error.requestFailed')}
          </p>
          {!sessionExpired && !forbidden ? (
            <Button onClick={onRetry} size='sm' variant='outline'>
              {t('status.retry')}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (!materials || materials.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('materials.list.empty')}
      </p>
    );
  }

  return (
    <ul className='space-y-3'>
      {materials.map((material) => (
        <MaterialListItem
          key={material.id}
          material={material}
          onReload={onReload}
        />
      ))}
    </ul>
  );
}

function MaterialListItem({
  material,
  onReload,
}: {
  readonly material: Material;
  readonly onReload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const canEdit = useCan({
    resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
    action: 'edit',
  });
  const canDelete = useCan({
    resource: { type: 'composite', id: MATERIALS_RESOURCE_ID },
    action: 'delete',
  });
  const canManage = canEdit.can && canDelete.can;

  return (
    <li className='flex items-start gap-2 rounded-lg border p-3'>
      <Link
        className='min-w-0 flex-1 space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring'
        to={{ pathname: String(material.id), search: location.search }}
      >
        <span className='block font-medium'>{material.title}</span>
        <span className='line-clamp-3 block text-sm text-muted-foreground'>
          {material.body}
        </span>
        {material.confidential ? (
          <span className='inline-block text-xs font-medium text-destructive'>
            {t('materials.list.confidential')}
          </span>
        ) : null}
      </Link>
      {canManage ? (
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            aria-label={t('materials.edit.action')}
            nativeButton={false}
            render={
              <Link
                to={{
                  pathname: `edit/${material.id}`,
                  search: location.search,
                }}
              />
            }
            size='icon-sm'
            variant='ghost'
          >
            <PencilIcon />
          </Button>
          <DeleteMaterialButton material={material} onDeleted={onReload} />
        </div>
      ) : null}
    </li>
  );
}

function DeleteMaterialButton({
  material,
  onDeleted,
}: {
  readonly material: Material;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await api
        .repository<Material>('materials')
        .deleteOne({ filter: { id: material.id } });
      toaster.show({
        type: 'success',
        title: t('materials.delete.success', { name: material.title }),
      });
      setOpen(false);
      onDeleted();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        toaster.show({
          type: 'info',
          title: t('materials.delete.alreadyGone'),
        });
        setOpen(false);
        onDeleted();
        return;
      }
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('materials.error.forbidden')
            : t('materials.error.requestFailed'),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            aria-label={t('materials.delete.action')}
            size='icon-sm'
            variant='ghost'
          />
        }
      >
        <TrashIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('materials.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('materials.delete.description', { name: material.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? <Spinner /> : null}
            {t('actions.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
