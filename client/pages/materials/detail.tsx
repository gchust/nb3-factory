import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

import { getMaterial, updateMaterial, type Material } from './api';
import { MaterialForm, type MaterialDraft } from './material-form';
import { materialErrorMessage } from './message';

/**
 * One material and its attachments: their real content, a download action, and
 * removal that takes effect when the material is saved.
 *
 * Removing an attachment detaches it from the material on save; the uploaded
 * record itself is kept, never deleted.
 */
export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { id = '' } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material>();
  const [draft, setDraft] = useState<MaterialDraft>({ title: '', files: [] });
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const applyMaterial = useCallback((next: Material) => {
    setMaterial(next);
    setDraft({ title: next.title, files: [] });
    setRemoved([]);
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      try {
        const loaded = await getMaterial(api, id);
        if (active) applyMaterial(loaded);
      } catch (cause) {
        if (active) setError(materialErrorMessage(cause, t));
      }
    })();
    return () => {
      active = false;
    };
  }, [api, applyMaterial, id, t]);

  const save = async (): Promise<void> => {
    if (!material) return;
    setSaving(true);
    setError(undefined);
    try {
      const kept = material.attachments
        .filter((attachment) => !removed.includes(attachment.id))
        .map((attachment) => attachment.id);
      const saved = await updateMaterial(api, material.id, {
        title: draft.title,
        attachmentIds: [...kept, ...draft.files.map((file) => file.id)],
      });
      applyMaterial(saved);
    } catch (cause) {
      setError(materialErrorMessage(cause, t));
    } finally {
      setSaving(false);
    }
  };

  if (!material) {
    return (
      <PageContainer>
        <PageHeader title={t('materials.detailTitle')} />
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : (
          <Spinner />
        )}
      </PageContainer>
    );
  }

  const visible = material.attachments.filter(
    (attachment) => !removed.includes(attachment.id),
  );

  return (
    <PageContainer>
      <PageHeader
        title={material.title}
        description={t('materials.detailDescription')}
        actions={
          <Button
            variant='outline'
            render={<Link to='/materials' />}
            data-icon='inline-start'
          >
            <ArrowLeft aria-hidden='true' />
            {t('materials.backToList')}
          </Button>
        }
      />
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>{t('materials.detailTitle')}</CardTitle>
          <CardDescription>
            {t('materials.attachmentCount', {
              count: visible.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <MaterialForm
            draft={draft}
            onDraftChange={setDraft}
            onSave={save}
            saving={saving}
            error={error}
            savedAttachments={visible}
            onRemoveSavedAttachment={(attachmentId) =>
              setRemoved((current) =>
                current.includes(attachmentId)
                  ? current
                  : [...current, attachmentId],
              )
            }
          />
          {removed.length ? (
            <div
              role='status'
              className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'
            >
              {t('materials.removePending')}
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={() => setRemoved([])}
              >
                {t('materials.undo')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
