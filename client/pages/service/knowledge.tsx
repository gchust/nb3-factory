import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BookOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  serviceRequest,
  useServiceResource,
  type KnowledgeArticle,
} from './model.js';
import { ErrorState, LoadingState } from './shared.js';

function ArticleDialog({
  article,
  onClose,
  onSaved,
}: {
  readonly article: KnowledgeArticle | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [published, setPublished] = useState(article?.published ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (): Promise<void> => {
    if (!title.trim() || !body.trim()) {
      setError(t('service.validation.required'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const payload = { title, body, published };
      if (article) {
        await serviceRequest(api, `knowledge/${article.id}`, {
          method: 'PUT',
          json: payload,
        });
      } else {
        await serviceRequest(api, 'knowledge', {
          method: 'POST',
          json: payload,
        });
      }
      toaster.show({ type: 'success', title: t('service.saved') });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {article
              ? t('service.knowledge.edit')
              : t('service.knowledge.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.knowledge.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='knowledge-title'>
              {t('service.knowledge.title')}
            </FieldLabel>
            <Input
              id='knowledge-title'
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='knowledge-body'>
              {t('service.knowledge.body')}
            </FieldLabel>
            <Textarea
              id='knowledge-body'
              required
              className='min-h-40'
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='knowledge-published'>
              {t('service.knowledge.published')}
            </FieldLabel>
            <input
              id='knowledge-published'
              type='checkbox'
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />
          </Field>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => void submit()}
            disabled={pending}
          >
            {pending ? t('service.saving') : t('service.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const articles = useServiceResource<KnowledgeArticle[]>('knowledge');
  const [editing, setEditing] = useState<KnowledgeArticle | null | 'new'>(null);
  const [deleting, setDeleting] = useState<KnowledgeArticle | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setPendingDelete(true);
    try {
      await serviceRequest(api, `knowledge/${deleting.id}`, {
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('service.deleted') });
      setDeleting(null);
      articles.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.deleteFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPendingDelete(false);
    }
  }, [api, articles, deleting, t, toaster]);

  const columns = useMemo<ColumnDef<KnowledgeArticle>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.knowledge.title')}
          />
        ),
        cell: ({ row }) => (
          <button
            type='button'
            className='text-left font-medium text-primary hover:underline'
            onClick={() => setSelected(row.original)}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        id: 'excerpt',
        header: () => <span>{t('service.knowledge.body')}</span>,
        cell: ({ row }) => (
          <span className='line-clamp-1 text-muted-foreground'>
            {row.original.body.slice(0, 80)}
          </span>
        ),
      },
      {
        accessorKey: 'published',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.knowledge.published')}
          />
        ),
        cell: ({ row }) =>
          row.original.published ? (
            <Badge variant='secondary'>
              {t('service.knowledge.publishedYes')}
            </Badge>
          ) : (
            <Badge variant='outline'>
              {t('service.knowledge.publishedNo')}
            </Badge>
          ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>{t('service.actions')}</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('service.actions')}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <PencilIcon />
                {t('service.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon />
                {t('service.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.knowledge')}
        description={t('service.knowledge.description')}
        actions={
          <Button type='button' onClick={() => setEditing('new')}>
            <PlusIcon data-icon='inline-start' />
            {t('service.knowledge.create')}
          </Button>
        }
      />

      {articles.loading ? (
        <LoadingState />
      ) : articles.error ? (
        <ErrorState message={articles.error} onRetry={articles.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={articles.data ?? []}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
        />
      )}

      {selected ? (
        <Dialog open onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <BookOpenIcon className='size-4' />
                {selected.title}
              </DialogTitle>
            </DialogHeader>
            <p className='whitespace-pre-wrap text-sm'>{selected.body}</p>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      ) : null}

      {editing ? (
        <ArticleDialog
          article={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            articles.reload();
          }}
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.knowledge.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.knowledge.deleteDescription', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={pendingDelete}
            >
              {t('service.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
