import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

import {
  formatUpdatedAt,
  getDocument,
  updateDocument,
  type DocumentRecord,
} from './api.js';

/**
 * What has been loaded for one id. Carrying the id makes "still loading" a derived value rather than
 * a state the effect has to set before it starts: a render for a new id that has no entry yet is
 * loading, and a response for an id the user has navigated away from is simply ignored.
 */
interface LoadedDocument {
  readonly id: number;
  readonly state: 'ready' | 'missing' | 'error';
  readonly document?: DocumentRecord;
}

/**
 * One document, opened over the list.
 *
 * A caller who may not read it gets the same "not available" state as a document that does not
 * exist, because that is what the endpoint answers: the page must not disclose that a
 * supervisor-only document is there. The edit form appears only for a caller holding the composite
 * `edit` action, and the server re-checks it on save.
 */
export default function DocumentDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const params = useParams();
  const documentId = Number(params.id);
  const validId = Number.isInteger(documentId) && documentId > 0;
  const { can, isPending } = useCan({
    resource: { type: 'composite', id: 'documents.records' },
    action: 'edit',
  });

  const [loaded, setLoaded] = useState<LoadedDocument>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });

  useEffect(() => {
    let active = true;
    if (!validId) return () => undefined;

    getDocument(api, documentId)
      .then((found) => {
        if (!active) return;
        if (!found) {
          setLoaded({ id: documentId, state: 'missing' });
          return;
        }
        setDraft({ title: found.title, body: found.body });
        setEditing(false);
        setLoaded({ id: documentId, state: 'ready', document: found });
      })
      .catch(() => {
        if (active) setLoaded({ id: documentId, state: 'error' });
      });

    return () => {
      active = false;
    };
  }, [api, documentId, validId]);

  const current = loaded?.id === documentId ? loaded : undefined;
  const state = !validId ? 'missing' : (current?.state ?? 'loading');
  const document = current?.document;

  async function save(): Promise<void> {
    if (!document) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) {
      toaster.show({ type: 'error', title: t('documents.validationError') });
      return;
    }

    setSaving(true);
    try {
      const updated = await updateDocument(api, document.id, { title, body });
      setDraft({ title: updated.title, body: updated.body });
      setEditing(false);
      setLoaded({ id: updated.id, state: 'ready', document: updated });
      toaster.show({ type: 'success', title: t('documents.saved') });
    } catch {
      toaster.show({ type: 'error', title: t('documents.saveError') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton>{t('documents.back')}</BackButton>

        {state === 'loading' ? (
          <div aria-busy='true' className='space-y-3'>
            <Skeleton className='h-9 w-2/3' />
            <Skeleton className='h-40 w-full' />
          </div>
        ) : null}

        {state === 'missing' || state === 'error' ? (
          <Alert role='alert' variant='destructive'>
            <AlertDescription>
              {state === 'missing'
                ? t('documents.notFound')
                : t('documents.readError')}
            </AlertDescription>
          </Alert>
        ) : null}

        {state === 'ready' && document ? (
          editing ? (
            <form
              className='space-y-4'
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className='space-y-1.5'>
                <Label htmlFor='document-title'>
                  {t('documents.editTitle')}
                </Label>
                <Input
                  id='document-title'
                  disabled={saving}
                  maxLength={200}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      title: event.target.value,
                    }))
                  }
                  value={draft.title}
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='document-body'>{t('documents.editBody')}</Label>
                <Textarea
                  id='document-body'
                  className='min-h-64'
                  disabled={saving}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      body: event.target.value,
                    }))
                  }
                  value={draft.body}
                />
              </div>
              <div className='flex items-center gap-2'>
                <Button disabled={saving} type='submit'>
                  {saving ? t('documents.saving') : t('actions.save')}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setDraft({ title: document.title, body: document.body });
                    setEditing(false);
                  }}
                  type='button'
                  variant='ghost'
                >
                  {t('actions.cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <PageHeader
                title={document.title}
                description={t('documents.updatedAt', {
                  date: formatUpdatedAt(
                    document.updatedAt,
                    i18n.language ?? 'en-US',
                  ),
                })}
                actions={
                  !isPending && can ? (
                    <Button onClick={() => setEditing(true)} variant='outline'>
                      <Pencil />
                      {t('documents.edit')}
                    </Button>
                  ) : null
                }
              />
              <article className='whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-5 text-sm leading-7 text-card-foreground'>
                {document.body}
              </article>
            </>
          )
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
