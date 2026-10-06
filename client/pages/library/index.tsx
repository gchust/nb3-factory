import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

/**
 * The internal document library.
 *
 * The page owns no permission rule of its own: it renders the documents the
 * endpoint returns and shows a create or edit control from the `canCreate` and
 * `editableIds` the endpoint computes from the caller's grants. A reader
 * therefore sees a read-only list, and a confidential document never reaches
 * the browser because the database policy filters it before the response.
 */
interface LibraryDocument {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

interface LibraryListResponse {
  readonly data: LibraryDocument[];
  readonly meta: {
    readonly total: number;
    readonly canCreate: boolean;
    readonly editableIds: string[];
  };
}

interface DocumentFormValues {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

type DialogState =
  | { readonly mode: 'create' }
  | { readonly mode: 'view'; readonly document: LibraryDocument }
  | { readonly mode: 'edit'; readonly document: LibraryDocument };

export default function LibraryPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [list, setList] = useState<LibraryListResponse>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<LibraryListResponse>({
        path: 'documents',
        signal: controller.signal,
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setList(result);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => {
    // Reset from an event handler, not from the effect: the effect only reports
    // a request's result, so it never triggers a cascading render on mount.
    setLoading(true);
    setError(undefined);
    setList(undefined);
    setReloadCount((count) => count + 1);
  }, []);

  const editable = new Set(list?.meta.editableIds ?? []);

  return (
    <PageContainer>
      <PageHeader
        description={t('library.description')}
        title={t('library.title')}
        actions={
          list?.meta.canCreate ? (
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <PlusIcon />
              {t('library.create')}
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.loadFailed')}</AlertTitle>
          <AlertDescription>{describeError(error, t)}</AlertDescription>
          <Button className='mt-2' size='sm' variant='outline' onClick={reload}>
            {t('status.retry')}
          </Button>
        </Alert>
      ) : null}

      {loading ? (
        <div className='flex items-center gap-2 text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : null}

      {!loading && !error && list && list.data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('library.empty')}</p>
      ) : null}

      {!loading && !error && list && list.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('library.field.title')}</TableHead>
              <TableHead>{t('library.field.owner')}</TableHead>
              <TableHead>{t('library.field.published')}</TableHead>
              <TableHead>{t('library.field.confidential')}</TableHead>
              <TableHead className='text-right'>
                {t('library.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.map((document) => (
              <TableRow key={document.id}>
                <TableCell className='font-medium'>
                  <button
                    type='button'
                    className='text-left hover:underline'
                    onClick={() => setDialog({ mode: 'view', document })}
                  >
                    {document.title}
                  </button>
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {document.ownerName}
                </TableCell>
                <TableCell>
                  {document.published ? t('library.yes') : t('library.no')}
                </TableCell>
                <TableCell>
                  {document.confidential ? t('library.yes') : t('library.no')}
                </TableCell>
                <TableCell className='text-right'>
                  {editable.has(document.id) ? (
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => setDialog({ mode: 'edit', document })}
                    >
                      <PencilIcon />
                      {t('library.edit')}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {dialog?.mode === 'view' ? (
        <DocumentViewDialog
          document={dialog.document}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog && dialog.mode !== 'view' ? (
        <DocumentDialog
          key={dialog.mode === 'edit' ? dialog.document.id : 'create'}
          document={dialog.mode === 'edit' ? dialog.document : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

interface DocumentViewDialogProps {
  readonly document: LibraryDocument;
  readonly onClose: () => void;
}

/**
 * What any colleague with reading qualification sees: the whole document, and
 * no control that would change it. Reading does not imply editing, so this
 * dialog never offers a save.
 */
function DocumentViewDialog({
  document,
  onClose,
}: DocumentViewDialogProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('library.viewTitle')}</DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-1'>
            <p className='text-sm text-muted-foreground'>
              {t('library.field.title')}
            </p>
            <p className='font-medium'>{document.title}</p>
          </div>
          <div className='space-y-1'>
            <p className='text-sm text-muted-foreground'>
              {t('library.field.body')}
            </p>
            <p className='whitespace-pre-wrap'>{document.body}</p>
          </div>
          <div className='flex flex-wrap gap-x-8 gap-y-2 text-sm'>
            <span className='text-muted-foreground'>
              {t('library.field.owner')}: {document.ownerName}
            </span>
            <span className='text-muted-foreground'>
              {t('library.field.published')}:{' '}
              {document.published ? t('library.yes') : t('library.no')}
            </span>
            <span className='text-muted-foreground'>
              {t('library.field.confidential')}:{' '}
              {document.confidential ? t('library.yes') : t('library.no')}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DocumentDialogProps {
  readonly document?: LibraryDocument;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

function DocumentDialog({
  document,
  onClose,
  onSaved,
}: DocumentDialogProps): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const [values, setValues] = useState<DocumentFormValues>({
    title: document?.title ?? '',
    body: document?.body ?? '',
    published: document?.published ?? false,
    confidential: document?.confidential ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError(undefined);
    try {
      if (document) {
        await api.request({
          path: `documents/${encodeURIComponent(document.id)}`,
          method: 'PATCH',
          json: values,
        });
      } else {
        await api.request({ path: 'documents', method: 'POST', json: values });
      }
      toaster.show({ type: 'success', title: t('library.saved') });
      onSaved();
    } catch (cause) {
      setFormError(cause);
    } finally {
      setSaving(false);
    }
  }

  const booleanSelect = (
    id: string,
    value: boolean,
    onChange: (next: boolean) => void,
  ): ReactElement => (
    <Select
      value={value ? 'yes' : 'no'}
      onValueChange={(next) => onChange(next === 'yes')}
    >
      <SelectTrigger id={id} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='yes'>{t('library.yes')}</SelectItem>
        <SelectItem value='no'>{t('library.no')}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {document ? t('library.editTitle') : t('library.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <div className='space-y-2'>
            <Label htmlFor='library-title'>{t('library.field.title')}</Label>
            <Input
              id='library-title'
              required
              maxLength={200}
              value={values.title}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='library-body'>{t('library.field.body')}</Label>
            <Textarea
              id='library-body'
              rows={6}
              value={values.body}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='library-published'>
              {t('library.field.published')}
            </Label>
            {booleanSelect('library-published', values.published, (next) =>
              setValues((current) => ({ ...current, published: next })),
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='library-confidential'>
              {t('library.field.confidential')}
            </Label>
            {booleanSelect(
              'library-confidential',
              values.confidential,
              (next) =>
                setValues((current) => ({ ...current, confidential: next })),
            )}
          </div>

          {formError ? (
            <Alert variant='destructive'>
              <AlertTitle>{t('library.saveFailed')}</AlertTitle>
              <AlertDescription>{describeError(formError, t)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={saving || values.title.trim().length === 0}
            >
              {saving ? t('library.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A message a person can read, without leaking the developer-facing server message. */
function describeError(error: unknown, t: (key: string) => string): string {
  if (isApiError(error) && error.status === 403) {
    return t('library.denied');
  }
  return t('library.error');
}

function isApiError(error: unknown): error is { readonly status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}
