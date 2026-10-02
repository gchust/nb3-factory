import { useTranslation } from '@nocobase/i18n/client';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { FileTextIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

/** One knowledge document. The server never sends a field the caller may not read. */
interface DocumentRecord {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

/**
 * The composite resource the permission sets grant against. Its `manage` action
 * is what separates the supervisor, who maintains every document, from a
 * colleague, who only reads the documents their grant names.
 */
const MATERIALS_RESOURCE = 'documents.materials';
const MAX_TITLE = 255;
const MAX_CONTENT = 20_000;

type EditorState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly document: DocumentRecord };

interface DocumentValues {
  readonly title: string;
  readonly content: string;
}

/**
 * The document library: a read view for every signed-in user and, for a user
 * whose grant includes `manage`, the controls that create, edit and delete.
 * Which documents appear is decided by the API from the caller's grant, not
 * here, so a colleague simply never receives the confidential one.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const repository = useMemo(
    () => api.repository<DocumentRecord>('documentsMaterials'),
    [api],
  );
  const manage = useCan({
    resource: { type: 'composite', id: MATERIALS_RESOURCE },
    action: 'manage',
  });
  const retryManage = manage.retry;

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<EditorState>();
  const [deleting, setDeleting] = useState<DocumentRecord>();
  const [pending, setPending] = useState(false);

  const reportError = useCallback(
    (reason: unknown) => {
      if (reason instanceof ApiClientError && reason.status === 403) {
        // A refusal may mean the session's grants changed under us.
        retryManage();
      }
      toaster.show({
        type: 'error',
        title: t('materials.operationFailed'),
        description:
          reason instanceof ApiClientError ? reason.message : undefined,
      });
    },
    [retryManage, toaster, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const rows = await repository.findMany();
      setDocuments(
        [...rows].sort((left, right) => left.id.localeCompare(right.id)),
      );
    } catch (reason) {
      setLoadError(
        reason instanceof ApiClientError
          ? reason.message
          : t('materials.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [repository, t]);

  useEffect(() => {
    // Deferred so the effect itself does not set state during the same commit
    // as its mount; the load callback owns the loading flag.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = useCallback(
    async (values: DocumentValues) => {
      if (!editor) return;
      setPending(true);
      try {
        if (editor.mode === 'edit') {
          await repository.updateOne({
            filter: { id: editor.document.id },
            values,
          });
          toaster.show({ type: 'success', title: t('materials.updated') });
        } else {
          await repository.createOne({
            // A document needs a stable id for record selections and citations;
            // the person maintains only the title and the body.
            values: { id: `doc-${crypto.randomUUID()}`, ...values },
          });
          toaster.show({ type: 'success', title: t('materials.created') });
        }
        setEditor(undefined);
        await load();
      } catch (reason) {
        reportError(reason);
      } finally {
        setPending(false);
      }
    },
    [editor, load, reportError, repository, t, toaster],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setPending(true);
    try {
      await repository.deleteOne({ filter: { id: deleting.id } });
      toaster.show({ type: 'success', title: t('materials.deleted') });
      setDeleting(undefined);
      await load();
    } catch (reason) {
      reportError(reason);
    } finally {
      setPending(false);
    }
  }, [deleting, load, reportError, repository, t, toaster]);

  const canManage = manage.can;

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          canManage ? (
            <Button onClick={() => setEditor({ mode: 'create' })}>
              <PlusIcon data-icon='inline-start' />
              {t('materials.create')}
            </Button>
          ) : null
        }
      />

      {loadError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.loadFailed')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
          <Button
            className='mt-2 w-fit'
            variant='outline'
            size='sm'
            onClick={() => void load()}
          >
            {t('materials.retry')}
          </Button>
        </Alert>
      ) : null}

      {loading ? (
        <div className='space-y-2 rounded-lg border p-4'>
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-4/5' />
        </div>
      ) : documents.length === 0 ? (
        <Empty className='rounded-lg border bg-card'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='overflow-hidden rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-1/4'>
                  {t('materials.columnTitle')}
                </TableHead>
                <TableHead>{t('materials.columnContent')}</TableHead>
                {canManage ? (
                  <TableHead className='w-28 text-right'>
                    {t('materials.columnActions')}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className='align-top font-medium whitespace-normal'>
                    {document.title}
                  </TableCell>
                  <TableCell className='align-top whitespace-normal text-muted-foreground'>
                    {document.content}
                  </TableCell>
                  {canManage ? (
                    <TableCell className='text-right align-top'>
                      <div className='flex justify-end gap-1'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('materials.edit')}
                          onClick={() => setEditor({ mode: 'edit', document })}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('materials.delete')}
                          onClick={() => setDeleting(document)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editor !== undefined}
        onOpenChange={(open) => {
          if (!open && !pending) setEditor(undefined);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          {editor ? (
            <DocumentForm
              key={editor.mode === 'edit' ? editor.document.id : 'create'}
              initial={editor.mode === 'edit' ? editor.document : undefined}
              pending={pending}
              onCancel={() => setEditor(undefined)}
              onSubmit={(values) => void submit(values)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.deleteDescription', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {t('materials.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface DocumentFormProps {
  readonly initial?: DocumentRecord;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (values: DocumentValues) => void;
}

/** The create and edit form, mounted fresh per record so its draft starts clean. */
function DocumentForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [errors, setErrors] = useState<{
    title?: string;
    content?: string;
  }>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nextErrors: { title?: string; content?: string } = {};
    if (!title.trim()) nextErrors.title = t('materials.titleRequired');
    if (!content.trim()) nextErrors.content = t('materials.contentRequired');
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.content) return;
    onSubmit({ title: title.trim(), content: content.trim() });
  };

  return (
    <form noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {initial ? t('materials.editTitle') : t('materials.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('materials.formDescription')}</DialogDescription>
      </DialogHeader>
      <FieldGroup className='py-4'>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor='material-title'>
            {t('materials.fieldTitle')}
          </FieldLabel>
          <Input
            id='material-title'
            value={title}
            maxLength={MAX_TITLE}
            aria-invalid={errors.title ? true : undefined}
            onChange={(event) => setTitle(event.target.value)}
          />
          {errors.title ? <FieldError>{errors.title}</FieldError> : null}
        </Field>
        <Field data-invalid={errors.content ? true : undefined}>
          <FieldLabel htmlFor='material-content'>
            {t('materials.fieldContent')}
          </FieldLabel>
          <Textarea
            id='material-content'
            value={content}
            rows={6}
            maxLength={MAX_CONTENT}
            aria-invalid={errors.content ? true : undefined}
            onChange={(event) => setContent(event.target.value)}
          />
          {errors.content ? <FieldError>{errors.content}</FieldError> : null}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={onCancel}
        >
          {t('actions.cancel')}
        </Button>
        <Button type='submit' disabled={pending}>
          {t('actions.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
