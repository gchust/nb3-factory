import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { toast } from '#components/ui/toast';

import { DocumentDialog } from './document-dialog.js';
import type { DocumentInput, DocumentRecord } from './types.js';

type DialogState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit' | 'view'; readonly document: DocumentRecord };

export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = useAuthentication();
  const canCreate = useCan({
    resource: { type: 'composite', id: 'documents' },
    action: 'create',
  }).can;
  const canEdit = useCan({
    resource: { type: 'composite', id: 'documents' },
    action: 'edit',
  }).can;
  const canDelete = useCan({
    resource: { type: 'composite', id: 'documents' },
    action: 'delete',
  }).can;
  const canAdminister = useCan({
    resource: { type: 'settings', id: 'documents.administration' },
    action: 'read',
  }).can;
  const [documents, setDocuments] = useState<readonly DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState>();
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<DocumentRecord>();
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: readonly DocumentRecord[] }>({
        path: 'documents',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setDocuments(data);
            setLoading(false);
          }
        },
        (failure: unknown) => {
          if (!controller.signal.aborted) {
            setError(failure);
            setLoading(false);
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return documents;
    return documents.filter(
      (document) =>
        document.title.toLocaleLowerCase().includes(query) ||
        document.body.toLocaleLowerCase().includes(query),
    );
  }, [documents, search]);

  const reload = (): void => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  };

  // A maintainer may edit and delete only their own documents. Administrators may manage every document.
  const mayModify = (document: DocumentRecord): boolean =>
    canAdminister || document.ownerId === session?.user.id;

  const save = async (input: DocumentInput): Promise<void> => {
    if (!dialog) return;
    setPending(true);
    try {
      if (dialog.mode === 'create') {
        const { data } = await api.request<{ data: DocumentRecord }>({
          path: 'documents',
          method: 'POST',
          json: input,
        });
        setDocuments((current) => [data, ...current]);
        toast.add({
          title: t('documents.toast.created'),
          type: 'success',
        });
      } else if (dialog.mode === 'edit') {
        const { data } = await api.request<{ data: DocumentRecord }>({
          path: `documents/${encodeURIComponent(dialog.document.id)}`,
          method: 'PATCH',
          json: input,
        });
        setDocuments((current) =>
          current.map((item) => (item.id === data.id ? data : item)),
        );
        toast.add({
          title: t('documents.toast.updated'),
          type: 'success',
        });
      }
      setDialog(undefined);
    } catch (failure) {
      toast.add({
        title: t('documents.toast.saveFailed'),
        description: failureMessage(t, failure),
        type: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.request<void>({
        path: `documents/${encodeURIComponent(deleting.id)}`,
        method: 'DELETE',
      });
      setDocuments((current) =>
        current.filter((item) => item.id !== deleting.id),
      );
      toast.add({
        title: t('documents.toast.deleted'),
        type: 'success',
      });
      setDeleting(undefined);
    } catch (failure) {
      toast.add({
        title: t('documents.toast.deleteFailed'),
        description: failureMessage(t, failure),
        type: 'error',
      });
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          canCreate ? (
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <PlusIcon data-icon='inline-start' />
              {t('documents.new')}
            </Button>
          ) : undefined
        }
      />

      <div className='flex flex-col gap-4'>
        <div className='relative max-w-sm'>
          <SearchIcon
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            aria-label={t('documents.search')}
            placeholder={t('documents.search')}
            className='pl-8'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error ? (
          <Alert variant='destructive'>
            <TriangleAlertIcon />
            <AlertTitle>{t('documents.loadFailed')}</AlertTitle>
            <AlertDescription className='flex items-center gap-3'>
              <span>{failureMessage(t, error)}</span>
              <Button size='sm' variant='outline' onClick={reload}>
                {t('documents.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className='flex items-center justify-center gap-2 rounded-xl border border-border py-20 text-sm text-muted-foreground'>
            <Spinner />
            {t('documents.loading')}
          </div>
        ) : !error && documents.length === 0 ? (
          <Empty className='rounded-xl border border-dashed border-border py-16'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>{t('documents.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('documents.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
            {canCreate ? (
              <Button onClick={() => setDialog({ mode: 'create' })}>
                <PlusIcon data-icon='inline-start' />
                {t('documents.new')}
              </Button>
            ) : null}
          </Empty>
        ) : (
          <div className='overflow-hidden rounded-xl border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documents.columns.title')}</TableHead>
                  <TableHead className='hidden md:table-cell'>
                    {t('documents.columns.visibility')}
                  </TableHead>
                  <TableHead className='hidden lg:table-cell'>
                    {t('documents.columns.updatedAt')}
                  </TableHead>
                  <TableHead className='w-12 text-right'>
                    <span className='sr-only'>
                      {t('documents.columns.actions')}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='py-12 text-center text-sm text-muted-foreground'
                    >
                      {t('documents.noResults')}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell className='max-w-80'>
                        <button
                          type='button'
                          className='flex max-w-full cursor-pointer flex-col gap-0.5 text-left'
                          onClick={() => setDialog({ mode: 'view', document })}
                        >
                          <span className='truncate font-medium'>
                            {document.title}
                          </span>
                          <span className='truncate text-sm text-muted-foreground'>
                            {document.body}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className='hidden md:table-cell'>
                        <div className='flex flex-wrap gap-1.5'>
                          <StatusBadge
                            tone={document.published ? 'success' : 'neutral'}
                          >
                            {document.published
                              ? t('documents.visibility.published')
                              : t('documents.visibility.draft')}
                          </StatusBadge>
                          {document.confidential ? (
                            <StatusBadge tone='warning'>
                              {t('documents.visibility.confidential')}
                            </StatusBadge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className='hidden text-sm text-muted-foreground lg:table-cell'>
                        {new Date(document.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right'>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size='icon-sm'
                                variant='ghost'
                                aria-label={t('documents.columns.actions')}
                              >
                                <MoreHorizontalIcon />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem
                              onClick={() =>
                                setDialog({ mode: 'view', document })
                              }
                            >
                              <FileTextIcon />
                              {t('documents.actions.view')}
                            </DropdownMenuItem>
                            {canEdit && mayModify(document) ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setDialog({ mode: 'edit', document })
                                }
                              >
                                <PencilIcon />
                                {t('documents.actions.edit')}
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete && mayModify(document) ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant='destructive'
                                  onClick={() => setDeleting(document)}
                                >
                                  <Trash2Icon />
                                  {t('documents.actions.delete')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialog ? (
        <DocumentDialog
          key={`${dialog.mode}:${'document' in dialog ? dialog.document.id : 'new'}`}
          mode={dialog.mode}
          document={'document' in dialog ? dialog.document : undefined}
          open
          pending={pending}
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
          onSubmit={(input) => void save(input)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.delete.description', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={deletePending}
              onClick={() => void confirmDelete()}
            >
              {deletePending ? <Spinner /> : null}
              {t('documents.actions.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function failureMessage(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return t('documents.errors.denied');
    if (error.status === 404) return t('documents.errors.notFound');
  }
  return t('documents.errors.generic');
}
