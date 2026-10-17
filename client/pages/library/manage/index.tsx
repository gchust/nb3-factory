import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  EllipsisIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Input } from '#components/ui/input';

import { deleteDocument, listDocuments } from '../api.js';
import { LIBRARY_RESOURCE } from '../constants.js';
import { DocumentTable } from '../document-table.js';
import { libraryKeys } from '../queries.js';
import type { LibraryDocument } from '../types.js';

const PAGE_SIZE = 20;

export default function ManageLibraryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument>();
  const canCreate = useCan({
    resource: { type: 'composite', id: LIBRARY_RESOURCE },
    action: 'create',
  });
  // A librarian manages their own records; an unrestricted administrator manages every record.
  const unrestricted = useCan('unrestricted');
  const mine = !unrestricted.can;

  const query = useQuery({
    queryKey: libraryKeys.documents(search, page, PAGE_SIZE, mine),
    queryFn: ({ signal }) =>
      listDocuments(api, {
        q: search,
        page,
        pageSize: PAGE_SIZE,
        mine,
        signal,
      }),
    enabled: !unrestricted.isPending,
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDocument(api, id),
    onSuccess: async () => {
      setPendingDelete(undefined);
      await queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });

  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const open = (document: LibraryDocument, suffix = ''): void => {
    void navigate({
      pathname: `${document.id}${suffix}`,
      search: location.search,
    });
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('library.manageTitle')}
        description={t('library.manageDescription')}
        actions={
          canCreate.can ? (
            <Button render={<Link to='new' />}>
              <PlusIcon data-icon='inline-start' />
              {t('library.actions.new')}
            </Button>
          ) : null
        }
      />

      <div className='relative w-full max-w-sm'>
        <SearchIcon
          className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
          aria-hidden
        />
        <Input
          aria-label={t('library.searchLabel')}
          className='pl-9'
          placeholder={t('library.searchPlaceholder')}
          type='search'
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {query.isPending ? (
        <Loading className='min-h-60' />
      ) : query.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.errors.load')}</AlertTitle>
          <AlertDescription>
            <Button
              size='sm'
              variant='outline'
              onClick={() => void query.refetch()}
            >
              {t('library.actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <DocumentTable
            documents={query.data?.documents ?? []}
            emptyTitle={t('library.empty.manageTitle')}
            emptyDescription={t('library.empty.manageDescription')}
            renderActions={(document) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('library.columns.actions')}
                  className='inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
                >
                  <EllipsisIcon className='size-4' />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-40'>
                  <DropdownMenuItem
                    className='gap-2'
                    onClick={() => open(document)}
                  >
                    <EyeIcon className='size-4' />
                    {t('library.actions.view')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='gap-2'
                    onClick={() => open(document, '/edit')}
                  >
                    <PencilIcon className='size-4' />
                    {t('library.actions.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='gap-2'
                    onClick={() => open(document, '/share')}
                  >
                    <Share2Icon className='size-4' />
                    {t('library.actions.share')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className='gap-2'
                    variant='destructive'
                    onClick={() => setPendingDelete(document)}
                  >
                    <Trash2Icon className='size-4' />
                    {t('library.actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
          {total > PAGE_SIZE ? (
            <div className='flex items-center justify-between gap-4'>
              <p className='text-sm text-muted-foreground'>
                {`${total} · ${page}/${pageCount}`}
              </p>
              <div className='flex gap-2'>
                <Button
                  disabled={page <= 1 || query.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('library.actions.previous')}
                </Button>
                <Button
                  disabled={page >= pageCount || query.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  {t('library.actions.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setPendingDelete(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {remove.error instanceof Error ? remove.error.message : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('library.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              variant='destructive'
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
              }}
            >
              {remove.isPending
                ? t('library.delete.deleting')
                : t('library.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet />
    </PageContainer>
  );
}
