import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { FileTextIcon, LockIcon, PlusIcon } from 'lucide-react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

/** One document as the API returns it. */
type DocumentRecord = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly accessLevel: 'public' | 'supervisor';
  readonly link: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type ListResponse = {
  readonly data: DocumentRecord[];
  readonly canManage: boolean;
};

type EditorState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly document: DocumentRecord };

/** Reads a text field from a form, ignoring a file or a missing value. */
function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function accessLevelLabel(
  t: (key: string) => string,
  level: DocumentRecord['accessLevel'],
): string {
  return level === 'supervisor'
    ? t('documents.accessLevel.supervisor')
    : t('documents.accessLevel.public');
}

/**
 * The document library.
 *
 * Every signed-in user reaches this page. The server decides what the list
 * contains: a regular colleague receives only `public` documents, while a
 * supervisor receives all of them and the maintenance controls. A restricted
 * document is therefore absent from a colleague's page *and* refused by
 * `GET /api/documents/:id`, not merely hidden in the browser.
 */
export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('doc');

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => api.request<ListResponse>({ path: 'documents' }),
    [api],
  );

  const applyDocuments = useCallback((response: ListResponse) => {
    setDocuments(response.data);
    setCanManage(response.canManage);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyDocuments(await load());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [applyDocuments, load]);

  useEffect(() => {
    let active = true;
    load().then(
      (response) => {
        if (!active) return;
        applyDocuments(response);
        setLoadFailed(false);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoadFailed(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [applyDocuments, load]);

  const selected = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId],
  );

  const openDocument = useCallback(
    (id: string) => {
      setSearchParams({ doc: id }, { replace: false });
    },
    [setSearchParams],
  );

  const closeDocument = useCallback(() => {
    setSearchParams({}, { replace: false });
  }, [setSearchParams]);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editor) {
        return;
      }
      const form = new FormData(event.currentTarget);
      const title = readFormString(form, 'title').trim();
      const content = readFormString(form, 'content').trim();
      const accessLevel =
        readFormString(form, 'accessLevel') === 'supervisor'
          ? 'supervisor'
          : 'public';
      if (!title || !content) {
        toaster.show({ type: 'error', title: t('documents.error.required') });
        return;
      }
      setSaving(true);
      try {
        if (editor.mode === 'create') {
          await api.request({
            path: 'documents',
            method: 'POST',
            json: { title, content, accessLevel },
          });
        } else {
          await api.request({
            path: `documents/${encodeURIComponent(editor.document.id)}`,
            method: 'PATCH',
            json: { title, content, accessLevel },
          });
        }
        setEditor(null);
        await refresh();
        toaster.show({ type: 'success', title: t('documents.saved') });
      } catch {
        toaster.show({ type: 'error', title: t('documents.error.save') });
      } finally {
        setSaving(false);
      }
    },
    [api, editor, refresh, t, toaster],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          canManage ? (
            <Button onClick={() => setEditor({ mode: 'create' })}>
              <PlusIcon data-icon='inline-start' />
              {t('documents.new')}
            </Button>
          ) : null
        }
      />

      {!loading && !canManage ? (
        <p className='text-sm text-muted-foreground'>
          {t('documents.readOnly')}
        </p>
      ) : null}

      {loading ? (
        <div className='grid gap-4 md:grid-cols-2'>
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : null}

      {!loading && loadFailed ? (
        <Card>
          <CardContent className='flex items-center justify-between gap-4 pt-6'>
            <span className='text-sm text-muted-foreground'>
              {t('documents.error.load')}
            </span>
            <Button variant='outline' onClick={() => void refresh()}>
              {t('status.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !loadFailed && documents.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('documents.empty')}</p>
      ) : null}

      {!loading && !loadFailed && documents.length > 0 ? (
        <div className='grid gap-4 md:grid-cols-2'>
          {documents.map((document) => (
            <Card key={document.id} className='flex flex-col'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileTextIcon className='size-4 text-muted-foreground' />
                  <span className='min-w-0 truncate'>{document.title}</span>
                  {document.accessLevel === 'supervisor' ? (
                    <Badge variant='secondary' className='ml-auto shrink-0'>
                      <LockIcon />
                      {accessLevelLabel(t, document.accessLevel)}
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {t('documents.updatedAt', {
                    date: new Date(document.updatedAt).toLocaleString(),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-1 flex-col gap-4'>
                <p className='line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground'>
                  {document.content}
                </p>
                <div className='mt-auto flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => openDocument(document.id)}
                  >
                    {t('documents.open')}
                  </Button>
                  {canManage ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setEditor({ mode: 'edit', document })}
                    >
                      {t('documents.edit')}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDocument();
          }
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                  {selected.title}
                  {selected.accessLevel === 'supervisor' ? (
                    <Badge variant='secondary'>
                      <LockIcon />
                      {accessLevelLabel(t, selected.accessLevel)}
                    </Badge>
                  ) : null}
                </DialogTitle>
                <DialogDescription>
                  {t('documents.updatedAt', {
                    date: new Date(selected.updatedAt).toLocaleString(),
                  })}
                </DialogDescription>
              </DialogHeader>
              <p className='max-h-[50vh] overflow-y-auto whitespace-pre-wrap px-4 py-2 text-sm leading-6'>
                {selected.content}
              </p>
              {canManage ? (
                <DialogFooter>
                  <Button
                    onClick={() => {
                      const editTarget: EditorState = {
                        mode: 'edit',
                        document: selected,
                      };
                      closeDocument();
                      setEditor(editTarget);
                    }}
                  >
                    {t('documents.edit')}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditor(null);
          }
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <form
            key={editor?.mode === 'edit' ? editor.document.id : 'new'}
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editor?.mode === 'edit'
                  ? t('documents.edit')
                  : t('documents.new')}
              </DialogTitle>
              <DialogDescription>
                {t('documents.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='document-title'>
                  {t('documents.field.title')}
                </FieldLabel>
                <Input
                  id='document-title'
                  name='title'
                  required
                  defaultValue={
                    editor?.mode === 'edit' ? editor.document.title : ''
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='document-content'>
                  {t('documents.field.content')}
                </FieldLabel>
                <Textarea
                  id='document-content'
                  name='content'
                  required
                  rows={6}
                  defaultValue={
                    editor?.mode === 'edit' ? editor.document.content : ''
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='document-access-level'>
                  {t('documents.field.accessLevel')}
                </FieldLabel>
                <Select
                  name='accessLevel'
                  defaultValue={
                    editor?.mode === 'edit'
                      ? editor.document.accessLevel
                      : 'public'
                  }
                >
                  <SelectTrigger id='document-access-level' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='public'>
                      {t('documents.accessLevel.public')}
                    </SelectItem>
                    <SelectItem value='supervisor'>
                      {t('documents.accessLevel.supervisor')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  {t('documents.field.accessLevelHint')}
                </p>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? t('documents.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
