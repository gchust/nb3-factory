import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpenIcon,
  CircleAlertIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import {
  fetchArticles,
  fetchManuals,
  saveArticle,
  type KnowledgeArticle,
  type Manual,
} from '../api.js';
import { formatDateTime } from '../format.js';
import {
  deleteKnowledgeBaseDocument,
  fetchKnowledgeBase,
  fetchKnowledgeBaseDocuments,
  fetchManualKnowledgeBaseAccess,
  uploadKnowledgeBaseDocument,
  vectorizeKnowledgeBaseDocument,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type ManualKnowledgeBaseAccess,
} from '../manual-knowledge-base.js';
import { LoadingBlock, QueryError } from '../shared.js';

/**
 * Knowledge access: published articles for staff, drafts for the supervisor,
 * and the internal device manuals. The server decides who sees a draft; this
 * page never hides an article on its own.
 */
export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reloadCount, setReloadCount] = useState(0);
  const [articles, setArticles] = useState<{
    key: string;
    list?: KnowledgeArticle[];
    error?: unknown;
  }>();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [editing, setEditing] = useState<
    KnowledgeArticle | 'new' | undefined
  >();
  const [openManual, setOpenManual] = useState<Manual>();
  const [manualAccess, setManualAccess] = useState<ManualKnowledgeBaseAccess>();
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>();
  const [kbDocuments, setKbDocuments] = useState<KnowledgeBaseDocument[]>();
  const [kbError, setKbError] = useState<unknown>();
  const [kbReloadCount, setKbReloadCount] = useState(0);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbDeleting, setKbDeleting] = useState<KnowledgeBaseDocument>();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    fetchArticles(api).then(
      (list) => {
        if (!controller.signal.aborted)
          setArticles({ key: String(reloadCount), list });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setArticles({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  useEffect(() => {
    let active = true;
    void fetchManuals(api).then(
      (list) => {
        if (active) setManuals(list);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const access = await fetchManualKnowledgeBaseAccess(api);
        const base = await fetchKnowledgeBase(api, access.knowledgeBaseKey);
        const documents = base
          ? await fetchKnowledgeBaseDocuments(api, access.knowledgeBaseKey)
          : [];
        if (!active) return;
        setManualAccess(access);
        setKnowledgeBase(base);
        setKbDocuments(documents);
      } catch (error: unknown) {
        if (active) setKbError(error);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, kbReloadCount]);

  const reloadKnowledgeBase = () => {
    setKbError(undefined);
    setKbReloadCount((count) => count + 1);
  };

  const reportError = (error: unknown, fallback: string) =>
    toaster.show({
      type: 'error',
      title: describeError(error) ?? fallback,
    });

  const uploadManual = async (file: File) => {
    if (!manualAccess) return;
    setKbBusy(true);
    try {
      await uploadKnowledgeBaseDocument(
        api,
        manualAccess.knowledgeBaseKey,
        file,
      );
      toaster.show({
        type: 'success',
        title: t('service.knowledge.kb.uploaded'),
      });
      reloadKnowledgeBase();
    } catch (error: unknown) {
      reportError(error, t('service.knowledge.kb.uploadFailed'));
    } finally {
      setKbBusy(false);
    }
  };

  const retryDocument = async (document: KnowledgeBaseDocument) => {
    if (!manualAccess) return;
    setKbBusy(true);
    try {
      await vectorizeKnowledgeBaseDocument(
        api,
        manualAccess.knowledgeBaseKey,
        document.id,
      );
      toaster.show({
        type: 'success',
        title: t('service.knowledge.kb.requeued'),
      });
      reloadKnowledgeBase();
    } catch (error: unknown) {
      reportError(error, t('service.error.requestFailed'));
    } finally {
      setKbBusy(false);
    }
  };

  const removeDocument = async (document: KnowledgeBaseDocument) => {
    setKbBusy(true);
    try {
      await deleteKnowledgeBaseDocument(api, document.id);
      toaster.show({
        type: 'success',
        title: t('service.knowledge.kb.removed'),
      });
      setKbDeleting(undefined);
      reloadKnowledgeBase();
    } catch (error: unknown) {
      reportError(error, t('service.error.requestFailed'));
    } finally {
      setKbBusy(false);
    }
  };

  const loading = articles?.key !== requestKey;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <PlusIcon />
            {t('service.knowledge.createArticle')}
          </Button>
        }
      />
      <Tabs defaultValue='articles'>
        <TabsList>
          <TabsTrigger value='articles'>
            <FileTextIcon /> {t('service.knowledge.articlesTab')}
          </TabsTrigger>
          <TabsTrigger value='manuals'>
            <BookOpenIcon /> {t('service.knowledge.manualsTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='articles' className='mt-4 space-y-3'>
          {articles?.error ? (
            <QueryError
              error={articles.error}
              onRetry={() => setReloadCount((count) => count + 1)}
            />
          ) : loading && !articles?.list ? (
            <LoadingBlock />
          ) : (articles?.list ?? []).length ? (
            (articles?.list ?? []).map((article) => (
              <Card key={article.id}>
                <CardHeader>
                  <div className='flex items-start justify-between gap-4'>
                    <div>
                      <CardTitle className='flex items-center gap-2 text-base'>
                        {article.title}
                        {article.published ? (
                          <Badge variant='secondary'>
                            {t('service.knowledge.published')}
                          </Badge>
                        ) : (
                          <Badge variant='outline'>
                            {t('service.knowledge.draft')}
                          </Badge>
                        )}
                      </CardTitle>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {article.category ? `${article.category} · ` : ''}
                        {formatDateTime(article.updatedAt)}
                      </p>
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setEditing(article)}
                    >
                      <PencilIcon />
                      {t('service.actions.edit')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                    {article.body}
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('service.knowledge.noArticles')}
            </p>
          )}
        </TabsContent>

        <TabsContent value='manuals' className='mt-4 space-y-3'>
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    {knowledgeBase?.name ?? t('service.knowledge.kb.title')}
                    {knowledgeBase ? (
                      <Badge
                        variant={
                          knowledgeBase.enabled ? 'secondary' : 'outline'
                        }
                      >
                        {knowledgeBase.enabled
                          ? t('service.knowledge.kb.enabled')
                          : t('service.knowledge.kb.disabled')}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {t('service.knowledge.kb.description')}
                  </p>
                </div>
                {manualAccess?.canManage ? (
                  <div className='flex items-center gap-2'>
                    <input
                      ref={uploadInputRef}
                      type='file'
                      accept='.md,.markdown,.txt'
                      className='hidden'
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void uploadManual(file);
                      }}
                    />
                    <Button
                      size='sm'
                      disabled={kbBusy}
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      <UploadIcon />
                      {t('service.actions.upload')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {kbError ? (
                <QueryError
                  error={kbError}
                  onRetry={() => reloadKnowledgeBase()}
                />
              ) : !kbDocuments ? (
                <LoadingBlock />
              ) : kbDocuments.length ? (
                kbDocuments.map((document) => (
                  <div
                    key={document.id}
                    className='flex flex-wrap items-start justify-between gap-4 rounded-xl border p-3'
                  >
                    <div className='min-w-0 space-y-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='truncate text-sm font-medium'>
                          {document.title ||
                            document.filename ||
                            `#${document.id}`}
                        </span>
                        <DocumentStatusBadge document={document} />
                      </div>
                      <p className='text-xs text-muted-foreground'>
                        {t('service.knowledge.kb.segments', {
                          count: document.segmentCount ?? 0,
                        })}
                        {' · '}
                        {formatDateTime(document.updatedAt)}
                      </p>
                      {document.errorMessage || document.segmentErrorMessage ? (
                        <p className='flex items-start gap-1 text-xs text-destructive'>
                          <CircleAlertIcon className='mt-0.5 size-3.5 shrink-0' />
                          <span className='break-words'>
                            {document.errorMessage ||
                              document.segmentErrorMessage}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    {manualAccess?.canManage ? (
                      <div className='flex items-center gap-2'>
                        {isFailedDocument(document) ? (
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={kbBusy}
                            onClick={() => void retryDocument(document)}
                          >
                            <RefreshCwIcon />
                            {t('service.knowledge.kb.requeue')}
                          </Button>
                        ) : null}
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-destructive'
                          disabled={kbBusy}
                          onClick={() => setKbDeleting(document)}
                        >
                          <Trash2Icon />
                          {t('service.actions.remove')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('service.knowledge.kb.empty')}
                </p>
              )}
            </CardContent>
          </Card>

          <h3 className='px-1 text-sm font-medium text-muted-foreground'>
            {t('service.knowledge.kb.builtIn')}
          </h3>
          {manuals.length ? (
            manuals.map((manual) => (
              <Card key={manual.slug}>
                <CardHeader>
                  <CardTitle className='text-base'>{manual.title}</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between gap-4'>
                  <p className='text-sm text-muted-foreground'>
                    {manual.summary}
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setOpenManual(manual)}
                  >
                    {t('service.knowledge.readManual')}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('service.knowledge.noManuals')}
            </p>
          )}
        </TabsContent>
      </Tabs>

      {editing ? (
        <ArticleDialog
          article={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setReloadCount((count) => count + 1);
            toaster.show({
              type: 'success',
              title: t('service.knowledge.saved'),
            });
          }}
        />
      ) : null}

      {openManual ? (
        <Dialog
          open
          onOpenChange={(open: boolean) => {
            if (!open) setOpenManual(undefined);
          }}
        >
          <DialogContent className='max-h-[80vh] overflow-y-auto sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>{openManual.title}</DialogTitle>
              <DialogDescription>{openManual.summary}</DialogDescription>
            </DialogHeader>
            <pre className='whitespace-pre-wrap font-sans text-sm'>
              {openManual.content}
            </pre>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setOpenManual(undefined)}
              >
                {t('service.actions.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog
        open={!!kbDeleting}
        onOpenChange={(open: boolean) => {
          if (!open) setKbDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.knowledge.kb.removeTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.knowledge.kb.removeBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kbBusy}>
              {t('service.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={kbBusy}
              onClick={() => {
                if (kbDeleting) void removeDocument(kbDeleting);
              }}
            >
              {t('service.actions.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/** A failed document can be queued for processing again from this page. */
function isFailedDocument(document: KnowledgeBaseDocument): boolean {
  const status = (document.indexStatus ?? '').toUpperCase();
  return status === 'ERROR' || status === 'FAILED';
}

/**
 * The message to show for a failed call. The Knowledge Base plugin reports its
 * reason in an `errors` array, which the generic API client does not surface in
 * `error.message`, so it is read here rather than showing a bare status code.
 */
function describeError(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload as
    { errors?: { message?: unknown }[] } | undefined;
  const nested = payload?.errors?.[0]?.message;
  if (typeof nested === 'string' && nested) return nested;
  return error.message || undefined;
}

/**
 * The processing status the server recorded for a document. Only the states the
 * plugin defines are translated; anything else is shown verbatim so an unknown
 * status is never rounded to a nicer one.
 */
function DocumentStatusBadge({
  document,
}: {
  readonly document: KnowledgeBaseDocument;
}): ReactElement | null {
  const { t } = useTranslation();
  const raw = document.indexStatus ?? document.segmentStatus;
  if (!raw) return null;
  const status = raw.toUpperCase();
  if (status === 'ERROR' || status === 'FAILED') {
    return (
      <Badge variant='destructive'>
        {t('service.knowledge.kb.statusFailed')}
      </Badge>
    );
  }
  if (status === 'SUCCESS' || status === 'COMPLETED') {
    return (
      <Badge variant='secondary'>{t('service.knowledge.kb.statusReady')}</Badge>
    );
  }
  if (status === 'PROCESSING') {
    return (
      <Badge variant='outline'>
        {t('service.knowledge.kb.statusProcessing')}
      </Badge>
    );
  }
  if (status === 'PENDING') {
    return (
      <Badge variant='outline'>{t('service.knowledge.kb.statusPending')}</Badge>
    );
  }
  return <Badge variant='outline'>{raw}</Badge>;
}

function ArticleDialog({
  article,
  onClose,
  onSaved,
}: {
  readonly article?: KnowledgeArticle;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    title: article?.title ?? '',
    body: article?.body ?? '',
    category: article?.category ?? '',
    published: article?.published ?? false,
  });

  async function submit(): Promise<void> {
    if (!form.title.trim() || !form.body.trim()) {
      setError(t('service.knowledge.form.required'));
      return;
    }
    setBusy(true);
    try {
      await saveArticle(api, {
        id: article?.id,
        title: form.title.trim(),
        body: form.body,
        category: form.category.trim() || null,
        published: form.published,
      });
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError && err.status === 403
          ? t('service.error.forbidden')
          : t('service.error.requestFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {article
              ? t('service.knowledge.editArticle')
              : t('service.knowledge.createArticle')}
          </DialogTitle>
          <DialogDescription>
            {t('service.knowledge.form.description')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='article-title'>
              {t('service.knowledge.form.title')}
            </FieldLabel>
            <Input
              id='article-title'
              value={form.title}
              onChange={(event) =>
                setForm((c) => ({ ...c, title: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='article-category'>
              {t('service.knowledge.form.category')}
            </FieldLabel>
            <Input
              id='article-category'
              value={form.category}
              onChange={(event) =>
                setForm((c) => ({ ...c, category: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='article-body'>
              {t('service.knowledge.form.body')}
            </FieldLabel>
            <Textarea
              id='article-body'
              rows={8}
              value={form.body}
              onChange={(event) =>
                setForm((c) => ({ ...c, body: event.target.value }))
              }
            />
          </Field>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='article-published'>
              {t('service.knowledge.form.published')}
            </FieldLabel>
            <Switch
              id='article-published'
              checked={form.published}
              onCheckedChange={(checked: boolean) =>
                setForm((c) => ({ ...c, published: checked }))
              }
            />
          </Field>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={busy}>
            {t('service.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t('service.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
