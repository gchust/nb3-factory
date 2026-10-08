import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  FileWarningIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  FilePreviewBody,
  FileThumbnail,
} from '@/extensions/nocobase-file-component-ui';

import { isUnauthenticated, materialErrorKey } from './errors.js';
import { formatDateTime } from './format.js';
import { fetchMaterial, updateMaterial } from './material-api.js';
import {
  LoadingBlock,
  LoadFailedAlert,
  SessionExpiredAlert,
} from './materials-state.js';
import type {
  Material,
  MaterialDetailOutletContext,
  MaterialFile,
  MaterialsOutletContext,
} from './types.js';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'notFound' }
  | {
      readonly status: 'error';
      readonly errorKey: ReturnType<typeof materialErrorKey>;
    }
  | { readonly status: 'ready'; readonly material: Material };

/**
 * A single material. It loads the record and, once it is there, hands it to the
 * view below, so the view's own state — which attachment is selected, which one
 * has been detached but not saved — is initialized from a record that exists.
 */
export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<MaterialsOutletContext>();
  const { materialId } = useParams<{ materialId: string }>();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<DetailState>({ status: 'loading' });

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!materialId) return;
    const controller = new AbortController();
    let active = true;
    fetchMaterial(api, materialId, controller.signal).then(
      (material) => {
        if (active) setState({ status: 'ready', material });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState(
          isUnauthenticated(error)
            ? { status: 'unauthenticated' }
            : error instanceof ApiClientError && error.status === 404
              ? { status: 'notFound' }
              : { status: 'error', errorKey: materialErrorKey(error) },
        );
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, materialId, revision]);

  if (state.status === 'loading') {
    return (
      <DetailFrame>
        <LoadingBlock />
      </DetailFrame>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <DetailFrame>
        <SessionExpiredAlert />
      </DetailFrame>
    );
  }

  if (!materialId || state.status === 'notFound') {
    return (
      <DetailFrame>
        <LoadFailedAlert message={t('materials.error.notFound')} />
      </DetailFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <DetailFrame>
        <LoadFailedAlert message={t(state.errorKey)} onRetry={reload} />
      </DetailFrame>
    );
  }

  return (
    <MaterialDetailView
      // The view's own state — the attachment selection and which ones have
      // been detached but not saved — is derived from the record's attachment
      // set, so a record that comes back with a different set remounts instead
      // of an effect copying the difference in after paint.
      key={state.material.files.map((file) => file.id).join(',')}
      material={state.material}
      onSaved={(saved) => {
        setState({ status: 'ready', material: saved });
        // The row count on the list behind this page may have changed.
        reloadList();
      }}
      onNotFound={() => {
        setState({ status: 'notFound' });
        reloadList();
      }}
    />
  );
}

/** The child-page shell the loading, failed and ready states share. */
function DetailFrame({
  children,
}: {
  readonly children: ReactElement;
}): ReactElement {
  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        {children}
      </PageContainer>
    </RouteChildPage>
  );
}

function MaterialDetailView({
  material,
  onSaved,
  onNotFound,
}: {
  readonly material: Material;
  readonly onSaved: (material: Material) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const [files, setFiles] = useState<readonly MaterialFile[]>(material.files);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    material.files[0]?.id,
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    files.map((file) => file.id).join(',') !==
    material.files.map((file) => file.id).join(',');
  const selected = files.find((file) => file.id === selectedId) ?? files[0];

  const detailContext = useMemo<MaterialDetailOutletContext>(
    () => ({ material, onSaved, onNotFound }),
    [material, onSaved, onNotFound],
  );

  const saveDetachment = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await updateMaterial(api, material.id, {
        fileIds: files.map((file) => file.id),
      });
      onSaved(saved);
      toaster.show({
        type: 'success',
        title: t('materials.detail.removeSaved'),
      });
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        toaster.show({ type: 'error', title: t('status.sessionExpired') });
      } else if (error instanceof ApiClientError && error.status === 404) {
        onNotFound();
      } else {
        toaster.show({
          type: 'error',
          title: t('materials.error.requestFailed'),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={material.title}
          description={t('materials.detail.updatedAt', {
            date: formatDateTime(material.updatedAt, locale),
          })}
          actions={
            <Button variant='outline' render={<Link to='edit' />}>
              <PencilIcon aria-hidden='true' />
              {t('materials.edit.action')}
            </Button>
          }
        />
        <section className='space-y-3'>
          <h2 className='text-sm font-medium'>{t('materials.detail.files')}</h2>
          {files.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('materials.detail.noFiles')}
            </p>
          ) : (
            <ul className='grid gap-3 sm:grid-cols-2' data-slot='file-list'>
              {files.map((file) => (
                <li
                  key={file.id}
                  className={`flex min-w-0 items-center gap-3 rounded-md border p-3 ${
                    file.id === selected?.id ? 'border-ring' : ''
                  }`}
                >
                  <button
                    type='button'
                    className='flex min-w-0 flex-1 items-center gap-3 text-left'
                    aria-pressed={file.id === selected?.id}
                    onClick={() => setSelectedId(file.id)}
                  >
                    <div className='h-12 w-12 shrink-0 overflow-hidden rounded-md'>
                      <FileThumbnail file={file} />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div
                        className='truncate font-medium'
                        title={file.filename}
                      >
                        {file.filename}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {file.mimeType}
                      </div>
                    </div>
                  </button>
                  <div className='flex shrink-0 items-center gap-1'>
                    <a
                      className={buttonVariants({
                        variant: 'ghost',
                        size: 'icon',
                      })}
                      href={file.contentUrl}
                      download={file.filename}
                      rel='noopener'
                      aria-label={`${t('materials.detail.download')}: ${file.filename}`}
                      title={t('materials.detail.download')}
                    >
                      <DownloadIcon aria-hidden='true' />
                    </a>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={`${t('materials.detail.remove')}: ${file.filename}`}
                      title={t('materials.detail.remove')}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item.id !== file.id),
                        )
                      }
                    >
                      <Trash2Icon aria-hidden='true' />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {dirty ? (
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                onClick={() => void saveDetachment()}
                disabled={saving}
              >
                {saving ? t('materials.form.saving') : t('actions.save')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setFiles(material.files)}
                disabled={saving}
              >
                {t('actions.cancel')}
              </Button>
            </div>
          ) : null}
        </section>
        <section className='space-y-3'>
          <h2 className='text-sm font-medium'>
            {t('materials.detail.preview')}
          </h2>
          {selected ? (
            <div className='rounded-md border p-3' data-slot='material-preview'>
              <FilePreviewBody file={selected} />
            </div>
          ) : (
            <div className='flex items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground'>
              <FileWarningIcon aria-hidden='true' className='size-4' />
              {t('materials.detail.selectHint')}
            </div>
          )}
        </section>
        <Outlet context={detailContext} />
      </PageContainer>
    </RouteChildPage>
  );
}
