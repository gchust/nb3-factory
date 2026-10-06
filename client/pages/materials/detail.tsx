import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  KNOWLEDGE_MATERIALS_COLLECTION,
  KNOWLEDGE_MATERIALS_RESOURCE,
} from '@/knowledge.js';

/** The two items a material holds, plus the database's own identifier. */
interface MaterialRecord {
  id: string;
  title: string;
  content: string;
}

/**
 * One material, covered over the list by the router.
 *
 * The record is fetched by identifier through the same generated Repository route the list uses, so the request is
 * scoped by the stored grant rather than by this page: a reader the material is not granted to gets `undefined`,
 * which is indistinguishable from a material that does not exist and is rendered the same way. There is no separate
 * "may they edit" endpoint — the form appears for an identity whose snapshot carries the `edit` action, and the
 * server refuses the write regardless of what the client shows.
 */
export default function MaterialDetailPage(): ReactElement {
  const params = useParams<{ materialId: string }>();
  // The route always supplies this; an empty identifier simply finds nothing and renders the same not-found state a
  // material the reader may not see produces.
  const materialId = params.materialId ?? '';
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const edit = useCan({
    resource: { type: 'composite', id: KNOWLEDGE_MATERIALS_RESOURCE },
    action: 'edit',
  });

  const [material, setMaterial] = useState<MaterialRecord | undefined>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  /** Bumped to re-run the read below, which is the only place the request is made. */
  const [revision, setRevision] = useState(0);

  // The request is started from the effect and every state update happens in a callback, so nothing is set while
  // React is still committing this render. `cancelled` covers the identifier changing before the answer arrives.
  useEffect(() => {
    let cancelled = false;
    api
      .repository<MaterialRecord>(KNOWLEDGE_MATERIALS_COLLECTION)
      .findOne({ filter: { id: materialId } })
      .then((record) => {
        if (cancelled) return;
        setMaterial(record);
        if (record) setDraft({ title: record.title, content: record.content });
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMaterial(undefined);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, materialId, revision]);

  const reload = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setRevision((current) => current + 1);
  }, []);

  const handleSave = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!material) return;
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content) return;
    setSaving(true);
    try {
      await api
        .repository<MaterialRecord>(KNOWLEDGE_MATERIALS_COLLECTION)
        .updateOne({ filter: { id: material.id }, values: { title, content } });
      setEditing(false);
      reload();
      toaster.show({
        type: 'success',
        title: t('knowledge.materials.detail.saved'),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: t('knowledge.materials.detail.saveFailed'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <Breadcrumbs />
        <PageHeader
          title={material?.title ?? t('knowledge.materials.detail.breadcrumb')}
          actions={
            material && edit.can && !editing ? (
              <Button variant='outline' onClick={() => setEditing(true)}>
                <Pencil data-icon='inline-start' />
                {t('knowledge.materials.detail.edit')}
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <p className='text-muted-foreground text-sm' role='status'>
            {t('status.loading')}
          </p>
        ) : failed ? (
          <Alert variant='destructive'>
            <AlertTitle>
              {t('knowledge.materials.detail.loadFailed')}
            </AlertTitle>
            <AlertDescription>
              <Button variant='outline' size='sm' onClick={reload}>
                {t('status.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !material ? (
          <Alert>
            <AlertTitle>
              {t('knowledge.materials.detail.notFoundTitle')}
            </AlertTitle>
            <AlertDescription>
              {t('knowledge.materials.detail.notFoundDescription')}
            </AlertDescription>
          </Alert>
        ) : editing ? (
          <form onSubmit={(event) => void handleSave(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='material-title'>
                  {t('knowledge.materials.fieldTitle')}
                </FieldLabel>
                <Input
                  id='material-title'
                  value={draft.title}
                  autoComplete='off'
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='material-content'>
                  {t('knowledge.materials.fieldContent')}
                </FieldLabel>
                <Textarea
                  id='material-content'
                  value={draft.content}
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <div className='mt-6 flex items-center gap-2'>
              <Button type='submit' disabled={saving}>
                {t('actions.save')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setDraft({
                    title: material.title,
                    content: material.content,
                  });
                  setEditing(false);
                }}
              >
                {t('actions.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <p className='text-sm leading-6 whitespace-pre-wrap'>
            {material.content}
          </p>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
