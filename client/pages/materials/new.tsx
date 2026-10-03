import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

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

import { createMaterial } from './api';
import { MaterialForm, type MaterialDraft } from './material-form';
import { materialErrorMessage } from './message';

/**
 * Creates a material from a title and its attachments.
 *
 * The attachment is uploaded when it is chosen and kept in the draft, so saving
 * with an empty title fails without losing it, and saving again reuses the
 * uploaded record instead of uploading a second time.
 */
export default function NewMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<MaterialDraft>({ title: '', files: [] });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const material = await createMaterial(api, {
        title: draft.title,
        attachmentIds: draft.files.map((file) => file.id),
      });
      await navigate(`/materials/${material.id}`);
    } catch (cause) {
      setError(materialErrorMessage(cause, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.newTitle')}
        description={t('materials.newDescription')}
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
          <CardTitle>{t('materials.newTitle')}</CardTitle>
          <CardDescription>{t('materials.titleRequired')}</CardDescription>
        </CardHeader>
        <CardContent>
          <MaterialForm
            draft={draft}
            onDraftChange={setDraft}
            onSave={save}
            saving={saving}
            error={error}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
