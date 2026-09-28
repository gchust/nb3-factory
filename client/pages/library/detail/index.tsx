/**
 * One document, presented as a drawer over the list.
 *
 * The drawer is a child route of `/library`, so its URL is shareable. That is
 * what the temporary-share rule hangs on: after an administrator revokes a
 * reader's access, re-opening the same link answers 404 and this screen says
 * so, rather than showing a cached copy.
 *
 * The action row is gated on the same composite capabilities the server
 * checks. Deleting asks for confirmation first, because it is the one action
 * here that cannot be undone.
 */
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { deleteDocument, fetchDocument } from '../library-api.js';
import { libraryDocumentResource } from '../library-resource.js';
import type { LibraryOutletContext } from '../index.js';
import type { LibraryDocument } from '../types.js';
import { DocumentShares } from './shares.js';

/** The context a child overlay reads with `useOutletContext()`. */
export interface DocumentOutletContext {
  readonly reloadDocument: () => void;
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function MetaRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

/** Rendered inside the drawer, so it may read the overlay context. */
function DocumentActions({
  document,
  onDeleted,
}: {
  readonly document: LibraryDocument;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const navigate = useNavigate();
  const api = useApiClient();
  const toaster = useToaster();
  const canEdit = useCan({ resource: libraryDocumentResource, action: 'edit' });
  const canDelete = useCan({
    resource: libraryDocumentResource,
    action: 'delete',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete(): Promise<void> {
    setIsDeleting(true);
    try {
      await deleteDocument(api, document.id);
      toaster.show({ type: 'success', title: t('library.delete.success') });
      onDeleted();
      await close();
    } catch {
      toaster.show({ type: 'error', title: t('library.submit.error') });
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className='flex flex-wrap justify-end gap-2'>
      {canEdit.can ? (
        <Button
          onClick={() => {
            void navigate('edit');
          }}
          variant='outline'
        >
          <PencilIcon />
          {t('library.detail.edit')}
        </Button>
      ) : null}
      {canDelete.can ? (
        <Button onClick={() => setConfirmOpen(true)} variant='destructive'>
          <Trash2Icon />
          {t('library.detail.delete')}
        </Button>
      ) : null}

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description', { title: document.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                void confirmDelete();
              }}
            >
              {isDeleting
                ? t('library.delete.deleting')
                : t('library.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function DocumentDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const { documentId } = useParams<{ documentId: string }>();
  const { reload: reloadList } = useOutletContext<LibraryOutletContext>();
  const [document, setDocument] = useState<LibraryDocument | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  const run = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      if (!documentId) {
        return;
      }
      try {
        const record = await fetchDocument(api, documentId, signal);
        if (signal.aborted) {
          return;
        }
        setDocument(record);
        setIsLoading(false);
      } catch (reason) {
        if (signal.aborted) {
          return;
        }
        setError(reason);
        setIsLoading(false);
      }
    },
    [api, documentId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // The initial load is a mount-time request to an external system. The compiler rule cannot model it, and the
    // fetch itself writes state only after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading one document on mount, not a synchronous update
    void run(controller.signal);
    return () => controller.abort();
  }, [run]);

  const notFound = error instanceof ApiClientError && error.status === 404;

  function reloadDocument(): void {
    setIsLoading(true);
    setError(undefined);
    void run(new AbortController().signal);
    reloadList();
  }

  return (
    <RouteDrawer
      description={t('library.detail.description')}
      title={document?.title ?? t('library.detail.title')}
    >
      {isLoading ? (
        <Loading className='py-12' />
      ) : notFound ? (
        <Alert>
          <AlertTitle>{t('library.detail.notFound.title')}</AlertTitle>
          <AlertDescription>
            {t('library.detail.notFound.description')}
          </AlertDescription>
        </Alert>
      ) : error || !document ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription className='flex flex-col items-start gap-3'>
            {t('library.error.description')}
            <Button
              onClick={() => reloadDocument()}
              size='sm'
              variant='outline'
            >
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className='space-y-6'>
          <div className='flex flex-wrap items-center gap-2'>
            {document.published ? (
              <Badge variant='secondary'>{t('library.status.published')}</Badge>
            ) : (
              <Badge variant='outline'>{t('library.status.draft')}</Badge>
            )}
            {document.confidential ? (
              <Badge variant='destructive'>
                {t('library.confidential.yes')}
              </Badge>
            ) : null}
          </div>

          <dl className='grid grid-cols-2 gap-4'>
            <MetaRow label={t('library.detail.owner')}>
              {document.ownerName ?? t('library.owner.none')}
            </MetaRow>
            <MetaRow label={t('library.detail.updatedAt')}>
              {formatDateTime(document.updatedAt, i18n.language)}
            </MetaRow>
            <MetaRow label={t('library.detail.createdAt')}>
              {formatDateTime(document.createdAt, i18n.language)}
            </MetaRow>
          </dl>

          <Separator />

          {document.body ? (
            <p className='text-sm leading-7 whitespace-pre-wrap'>
              {document.body}
            </p>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('library.detail.bodyEmpty')}
            </p>
          )}

          <DocumentShares documentId={document.id} />

          <Separator />

          <DocumentActions document={document} onDeleted={reloadList} />

          <div className='grid gap-2'>
            <Link className={buttonVariants({ variant: 'ghost' })} to='..'>
              {t('library.detail.back')}
            </Link>
          </div>

          <Outlet
            context={{ reloadDocument } satisfies DocumentOutletContext}
          />
        </div>
      )}
    </RouteDrawer>
  );
}
