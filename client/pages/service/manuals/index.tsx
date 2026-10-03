import {
  knowledgeBaseService,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
} from '@nocobase/app-plugin-ai-knowledge-base/client';
import { useTranslation } from '@nocobase/i18n/client';
import { BookOpen, Upload } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServiceApi } from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { EmptyBlock, ErrorBlock, LoadingBlock } from '../shared.js';
import { deviceManualSamples } from './samples.js';

interface ManualGroup {
  base: KnowledgeBase;
  documents: KnowledgeBaseDocument[];
  error?: Error;
}

const STABLE_KEY = 'device-manuals';
const MANUAL_NAME = '设备手册库 / Device manuals';

/**
 * The internal device-manual library.
 *
 * The AI Knowledge Base plugin owns the knowledge base, its documents and the
 * asynchronous segmentation/vectorization. This page gives every authorized
 * engineer a read surface for the documents that are actually usable, and a
 * maintenance surface for the supervisor that creates the library once,
 * uploads the short Markdown manuals and shows each document's real processing
 * status. Upload success is deliberately not shown as "ready": the status
 * badge and the failure reason come from the plugin, not from this page.
 */
export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const me = useAsync(() => api.me(), [api]);
  const canManage = me.data?.can.manageKnowledge ?? false;

  const state = useAsync(async (): Promise<ManualGroup[]> => {
    const bases = await knowledgeBaseService.listKnowledgeBases({
      mode: 'all',
    });
    return Promise.all(
      bases.rows.map(async (base): Promise<ManualGroup> => {
        try {
          const documents = await knowledgeBaseService.listDocuments({
            knowledgeBaseKey: base.key,
            mode: 'all',
          });
          return { base, documents: documents.rows };
        } catch (error) {
          return { base, documents: [], error: error as Error };
        }
      }),
    );
  }, []);

  async function ensureLibrary(): Promise<KnowledgeBase> {
    const bases = await knowledgeBaseService.listKnowledgeBases({
      mode: 'all',
    });
    const existing = bases.rows.find((base) => base.key === STABLE_KEY);
    if (existing) {
      return existing;
    }
    return knowledgeBaseService.createKnowledgeBase({
      key: STABLE_KEY,
      name: MANUAL_NAME,
      knowledgeBaseType: 'LOCAL',
    });
  }

  function report(kind: 'ok' | 'error', text: string): void {
    setMessage({ kind, text });
  }

  async function handleCreate(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await ensureLibrary();
      report('ok', t('service.manuals.created'));
      state.reload();
    } catch (error) {
      report('error', describe(error, t('service.manuals.createFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await uploadOne(file);
      report('ok', t('service.manuals.uploaded', { name: file.name }));
      state.reload();
    } catch (error) {
      report('error', describe(error, t('service.manuals.uploadFailed')));
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function uploadOne(file: File): Promise<void> {
    const base = await ensureLibrary();
    const constraints = await knowledgeBaseService.getUploadConstraints({
      knowledgeBaseKey: base.key,
    });
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const accepted = (constraints.acceptedExtensions ?? []).map((item) =>
      item.replace(/^\./, '').toLowerCase(),
    );
    if (accepted.length > 0 && !accepted.includes(ext)) {
      throw new Error(
        t('service.manuals.extensionRejected', {
          name: file.name,
          accepted: accepted.join(', '),
        }),
      );
    }
    await knowledgeBaseService.uploadDocument({
      knowledgeBaseKey: base.key,
      file,
    });
  }

  async function handleUploadSamples(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      for (const sample of deviceManualSamples) {
        const file = new File([sample.content], sample.filename, {
          type: 'text/markdown',
        });
        await uploadOne(file);
      }
      report('ok', t('service.manuals.samplesUploaded'));
      state.reload();
    } catch (error) {
      report('error', describe(error, t('service.manuals.uploadFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleVectorize(documentId: string | number): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const base = state.data?.find((group) =>
        group.documents.some((doc) => doc.id === documentId),
      )?.base;
      if (!base) {
        return;
      }
      await knowledgeBaseService.vectorizeDocuments({
        knowledgeBaseKey: base.key,
        documentIds: [documentId],
      });
      report('ok', t('service.manuals.vectorizeQueued'));
      state.reload();
    } catch (error) {
      report('error', describe(error, t('service.manuals.vectorizeFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
        actions={
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={state.reload}>
              {t('service.common.refresh')}
            </Button>
            {canManage ? (
              <Button
                size='sm'
                variant='outline'
                render={<Link to='/settings/ai/knowledge-base' />}
              >
                {t('service.manuals.openSettings')}
              </Button>
            ) : null}
          </div>
        }
      />

      {message ? (
        <p
          className={
            message.kind === 'ok'
              ? 'mb-4 text-sm text-muted-foreground'
              : 'mb-4 text-sm text-destructive'
          }
        >
          {message.text}
        </p>
      ) : null}

      {state.error ? (
        <ErrorBlock error={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <LoadingBlock />
      ) : (
        <div className='space-y-6'>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('service.manuals.maintain')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('service.manuals.maintainHint')}
                </p>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    size='sm'
                    disabled={busy}
                    onClick={() => void handleCreate()}
                  >
                    {t('service.manuals.ensureLibrary')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className='mr-1 size-4' />
                    {t('service.manuals.uploadManual')}
                  </Button>
                  <Button
                    size='sm'
                    variant='secondary'
                    disabled={busy}
                    onClick={() => void handleUploadSamples()}
                  >
                    {t('service.manuals.uploadSamples')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='.md,text/markdown'
                    className='hidden'
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUpload(file);
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {state.data.length === 0 ? (
            <EmptyBlock
              title={t('service.manuals.empty')}
              description={t('service.manuals.emptyHint')}
            />
          ) : (
            state.data.map((group) => (
              <Card key={group.base.key}>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <BookOpen className='size-4' />
                    {group.base.name}
                    <Badge variant='secondary'>{group.base.key}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {group.error ? (
                    <ErrorBlock error={group.error} onRetry={state.reload} />
                  ) : group.documents.length === 0 ? (
                    <EmptyBlock
                      title={t('service.manuals.noDocuments')}
                      description={t('service.manuals.noDocumentsHint')}
                    />
                  ) : (
                    group.documents.map((document) => (
                      <div
                        key={document.id}
                        className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3'
                      >
                        <div className='min-w-0'>
                          <p className='truncate font-medium'>
                            {document.title ??
                              document.filename ??
                              String(document.id)}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {document.filename}
                            {document.size ? ` · ${document.size} B` : ''}
                          </p>
                          {document.errorMessage ? (
                            <p className='mt-1 text-xs text-destructive'>
                              {document.errorMessage}
                            </p>
                          ) : null}
                        </div>
                        <div className='flex items-center gap-2'>
                          <Badge
                            variant={
                              document.indexStatus === 'SUCCESS'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {document.indexStatus ??
                              t('service.manuals.statusUnknown')}
                          </Badge>
                          {document.url ? (
                            <Button
                              size='sm'
                              variant='ghost'
                              render={
                                <a
                                  href={document.url}
                                  target='_blank'
                                  rel='noreferrer'
                                />
                              }
                            >
                              {t('service.common.open')}
                            </Button>
                          ) : null}
                          {canManage ? (
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={busy}
                              onClick={() => void handleVectorize(document.id)}
                            >
                              {t('service.manuals.reprocess')}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </PageContainer>
  );
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}
