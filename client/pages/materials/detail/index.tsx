import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useRouteOverlay } from '#components/use-route-overlay';

import { MaterialDeleteDialog } from '../material-delete-dialog.js';
import {
  MaterialConfidentialBadge,
  MaterialPublishBadge,
} from '../status-badges.js';
import type {
  Material,
  MaterialEditOutletContext,
  MaterialsOutletContext,
} from '../types.js';

/** Route `/materials/:materialId`: the material detail drawer. */
export default function MaterialDetailPage(): ReactElement {
  const { materialId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's state starts over.
  return <MaterialDetail key={materialId} materialId={materialId} />;
}

function MaterialDetail({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Functions and capabilities of the page behind the drawer, through <Outlet context> — the list.
  const { reload: reloadPage, afterDelete } =
    useOutletContext<MaterialsOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly material?: Material;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the parameters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    api
      .request<{ data: Material }>({
        path: `materials/${encodeURIComponent(materialId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, material: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists, or it is no longer open to this user: refresh the page behind (guideline R3).
          if (
            error instanceof ApiClientError &&
            (error.status === 404 || error.status === 403)
          ) {
            reloadPage();
          }
        },
      );
    return () => controller.abort();
  }, [api, materialId, reloadCount, reloadPage]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After an edit is saved, show the record the endpoint returned right away instead of waiting for a reload (guideline R2).
  const [saved, setSaved] = useState<Material>();
  // The edit dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const material = notFound ? undefined : (saved ?? result?.material);

  // The edit dialog (child route edit) gets these two callbacks through <Outlet context>. Keep them stable with
  // useMemo: the dialog's loading effect depends on them.
  const outletContext = useMemo<MaterialEditOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadPage();
      },
      onNotFound: () => {
        setGone(true);
        reloadPage();
      },
    }),
    [reloadPage],
  );

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (notFound || status === 403) {
    // Record not found or no permission: a retry will not succeed either, so only explain the situation.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('materials.error.notFound')
            : t('materials.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('materials.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!material) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <MaterialFields material={material} />;
  }

  return (
    <RouteDrawer
      title={material?.title ?? t('materials.detail.title')}
      className='sm:max-w-xl'
      footer={
        material ? (
          <MaterialDetailActions material={material} onDeleted={afterDelete} />
        ) : undefined
      }
    >
      {body}
      {/* The edit dialog (child route edit) and the share dialog (child route shares) render inside the drawer,
          stacked on it; placed outside the state branches, they are not unmounted when the drawer switches state. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/**
 * Record actions at the bottom of the drawer. The footer renders inside the drawer, so useRouteOverlay() can be
 * called here. Only the actions the server said this identity may perform are shown.
 */
function MaterialDetailActions({
  material,
  onDeleted,
}: {
  readonly material: Material;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const { capabilities } = useOutletContext<MaterialsOutletContext>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canUpdate = capabilities?.canUpdate ?? false;
  const canDelete = capabilities?.canDelete ?? false;
  const canShare = capabilities?.canShare ?? false;

  if (!canUpdate && !canDelete && !canShare) {
    return <></>;
  }

  return (
    <>
      {canDelete ? (
        <Button variant='destructive' onClick={() => setDeleteOpen(true)}>
          {t('materials.actions.delete')}
        </Button>
      ) : null}
      {canShare ? (
        <Button
          variant='outline'
          nativeButton={false}
          render={<Link to={{ pathname: 'shares', search: location.search }} />}
        >
          {t('materials.actions.share')}
        </Button>
      ) : null}
      {canUpdate ? (
        // Edit is a child route: the button renders as a link that keeps the query parameters.
        <Button
          nativeButton={false}
          render={<Link to={{ pathname: 'edit', search: location.search }} />}
        >
          {t('materials.actions.edit')}
        </Button>
      ) : null}
      {/* The delete confirmation uses component state. On success, first let the list refresh, then close the drawer. */}
      <MaterialDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        material={material}
        onDeleted={() => {
          onDeleted();
          void close();
        }}
      />
    </>
  );
}

function MaterialFields({
  material,
}: {
  readonly material: Material;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  return (
    <div className='space-y-4 text-sm'>
      <div>
        <p className='mb-2 text-muted-foreground'>
          {t('materials.fields.body')}
        </p>
        {material.body ? (
          // Preserve the author's line breaks; long text still wraps instead of widening the drawer.
          <p className='wrap-anywhere whitespace-pre-wrap'>{material.body}</p>
        ) : (
          <p className='text-muted-foreground'>
            {t('materials.detail.noBody')}
          </p>
        )}
      </div>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3'>
        <dt className='text-muted-foreground'>
          {t('materials.fields.ownerName')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>{material.ownerName ?? '—'}</dd>
        <dt className='text-muted-foreground'>
          {t('materials.fields.published')}
        </dt>
        <dd>
          <MaterialPublishBadge published={material.published} />
        </dd>
        <dt className='text-muted-foreground'>
          {t('materials.fields.confidential')}
        </dt>
        <dd>
          <MaterialConfidentialBadge confidential={material.confidential} />
        </dd>
        <dt className='text-muted-foreground'>
          {t('materials.fields.updatedAt')}
        </dt>
        <dd>{dateFormat.format(new Date(material.updatedAt))}</dd>
      </dl>
    </div>
  );
}
