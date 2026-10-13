import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
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
import { Loading } from '#components/loading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { listDocuments } from './api.js';
import { DocumentDeleteDialog } from './document-delete-dialog.js';
import type { DocumentSummary, DocumentsOutletContext } from './types.js';

const DOCUMENT_RESOURCE = { type: 'library.document', id: '*' } as const;

/**
 * The library: every document the signed-in person may read.
 *
 * What is listed is decided by the server, not filtered here: the owner sees their own documents in every state,
 * everyone else sees published and non-confidential documents plus the drafts currently shared with them. The row
 * menu only offers the actions each row's own answer allows.
 */
export default function DocumentsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [deleting, setDeleting] = useState<DocumentSummary>();
  const { can: canCreate, isPending: createPending } = useCan({
    resource: DOCUMENT_RESOURCE,
    action: 'create',
  });
  const { can: canShare } = useCan('unrestricted');

  // A user action: reset the indicators before fetching. Never called from the effect below, because a state update in
  // an effect body runs before the browser paints.
  const reload = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void listDocuments(api)
      .then((rows) => setDocuments(rows))
      .catch((cause: unknown) => setError(cause))
      .finally(() => setLoading(false));
  }, [api]);

  // The first load sets state only from the continuation of the request, so no update runs in the effect body itself.
  useEffect(() => {
    let cancelled = false;
    void listDocuments(api)
      .then((rows) => {
        if (!cancelled) {
          setDocuments(rows);
          setError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const outletContext: DocumentsOutletContext = { reload };

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          canCreate && !createPending ? (
            <Button onClick={() => void navigate('new')}>
              <PlusIcon data-icon='inline-start' />
              {t('library.create')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.loadFailed')}</AlertTitle>
          <AlertDescription className='flex flex-col gap-3'>
            <span>{t('library.loadFailed')}</span>
            <span>
              <Button variant='outline' size='sm' onClick={reload}>
                {t('library.retry')}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Loading className='py-16' />
      ) : documents.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t('library.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('library.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='overflow-x-auto rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('library.columns.title')}</TableHead>
                <TableHead>{t('library.columns.owner')}</TableHead>
                <TableHead>{t('library.columns.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('library.columns.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className='max-w-0'>
                    <button
                      type='button'
                      onClick={() => void navigate(document.id)}
                      className='block max-w-full truncate text-left font-medium hover:underline'
                    >
                      {document.title}
                    </button>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {document.ownerName ?? document.ownerId}
                  </TableCell>
                  <TableCell>
                    <DocumentStatuses document={document} />
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('library.actionsFor', {
                              title: document.title,
                            })}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-40'>
                        <DropdownMenuItem
                          className='gap-2'
                          onClick={() => void navigate(document.id)}
                        >
                          <FileTextIcon className='size-4' />
                          {t('library.actions.view')}
                        </DropdownMenuItem>
                        {document.canEdit ? (
                          <DropdownMenuItem
                            className='gap-2'
                            onClick={() => void navigate(`edit/${document.id}`)}
                          >
                            <PencilIcon className='size-4' />
                            {t('library.actions.edit')}
                          </DropdownMenuItem>
                        ) : null}
                        {canShare && !document.confidential ? (
                          <DropdownMenuItem
                            className='gap-2'
                            onClick={() =>
                              void navigate(`share/${document.id}`)
                            }
                          >
                            <Share2Icon className='size-4' />
                            {t('library.actions.share')}
                          </DropdownMenuItem>
                        ) : null}
                        {document.canEdit ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant='destructive'
                              className='gap-2'
                              onClick={() => setDeleting(document)}
                            >
                              <Trash2Icon className='size-4' />
                              {t('library.actions.delete')}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {deleting ? (
        <DocumentDeleteDialog
          document={deleting}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined);
          }}
          onDeleted={() => {
            setDeleting(undefined);
            reload();
          }}
        />
      ) : null}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

/** The labels that describe a document's state, in the order a reader needs them. */
function DocumentStatuses({
  document,
}: {
  readonly document: DocumentSummary;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap gap-1.5'>
      {document.confidential ? (
        <StatusBadge tone='warning'>
          {t('library.status.confidential')}
        </StatusBadge>
      ) : document.published ? (
        <StatusBadge tone='success'>
          {t('library.status.published')}
        </StatusBadge>
      ) : (
        <StatusBadge tone='neutral'>{t('library.status.draft')}</StatusBadge>
      )}
      {document.shared ? (
        <StatusBadge tone='info'>{t('library.status.shared')}</StatusBadge>
      ) : null}
    </div>
  );
}
