import { useTranslation } from '@nocobase/i18n/client';
import { useService } from '@nocobase/app-client';
import { SaveIcon } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  clientFileRepositoryManagerToken,
  FileList,
  FileUploadField,
  type FileRecord,
  type FileUiLabels,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import {
  PROJECT_MATERIAL_FILES_RESOURCE,
  projectMaterialErrorKey,
  useProjectMaterialsApi,
  type ProjectMaterialInput,
  type ProjectMaterialView,
} from './api.js';

export interface MaterialFormProps {
  readonly mode: 'create' | 'edit';
  readonly material?: ProjectMaterialView;
  readonly onSaved: (material: ProjectMaterialView) => void;
  readonly onCancel: () => void;
}

/**
 * The create and edit form. The title is validated on submit rather than by disabling Save, so an attachment that was
 * uploaded before the title was filled in stays in the list and the user only has to add the missing title.
 */
export function MaterialForm({
  mode,
  material,
  onSaved,
  onCancel,
}: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useProjectMaterialsApi();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(PROJECT_MATERIAL_FILES_RESOURCE),
    [manager],
  );

  const [title, setTitle] = useState(material?.title ?? '');
  const [attachments, setAttachments] = useState<readonly FileRecord[]>(
    material?.attachments ?? [],
  );
  const [titleError, setTitleError] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');
  const [saving, setSaving] = useState(false);

  const labels = useMemo<FileUiLabels>(
    () => ({
      choose: t('materials.form.chooseFiles'),
      empty: t('materials.form.noAttachments'),
      preview: t('materials.attachments.preview'),
      download: t('materials.attachments.download'),
      remove: t('materials.attachments.remove'),
    }),
    [t],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setTitleError(true);
        toast.add({
          type: 'error',
          title: t('materials.errors.TITLE_REQUIRED'),
          description: t('materials.errors.TITLE_REQUIRED_HINT'),
        });
        return;
      }

      setTitleError(false);
      setSaving(true);
      const input: ProjectMaterialInput = {
        title: trimmed,
        fileIds: attachments.map((file) => file.id),
      };
      try {
        const response =
          mode === 'create'
            ? await api.create(input)
            : await api.update(material!.id, input);
        toast.add({
          type: 'success',
          title: t('materials.toast.savedTitle'),
          description: t('materials.toast.savedDescription'),
        });
        onSaved(response.data);
      } catch (error) {
        toast.add({
          type: 'error',
          title: t('materials.toast.saveFailedTitle'),
          description: t(projectMaterialErrorKey(error)),
        });
      } finally {
        setSaving(false);
      }
    },
    [api, attachments, material, mode, onSaved, t, title],
  );

  return (
    <form className='space-y-6' onSubmit={(event) => void handleSubmit(event)}>
      <div className='space-y-2'>
        <Label htmlFor='material-title'>{t('materials.form.title')}</Label>
        <Input
          id='material-title'
          value={title}
          placeholder={t('materials.form.titlePlaceholder')}
          aria-invalid={titleError}
          onChange={(event) => {
            setTitle(event.target.value);
            if (titleError) setTitleError(false);
          }}
        />
        {titleError ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('materials.errors.TITLE_REQUIRED')}
          </p>
        ) : null}
      </div>

      <div className='space-y-2'>
        <Label>{t('materials.form.attachments')}</Label>
        <p className='text-sm text-muted-foreground'>
          {t('materials.form.attachmentsHint')}
        </p>
        <FileUploadField
          repository={repository}
          value={attachments}
          onChange={setAttachments}
          multiple
          onStatusChange={setUploadStatus}
          onError={(error) =>
            toast.add({
              type: 'error',
              title: t('materials.errors.uploadFailed'),
              description: error.message,
            })
          }
          labels={labels}
        />
        <FileList
          files={attachments}
          labels={labels}
          onError={(error) =>
            toast.add({
              type: 'error',
              title: t('materials.errors.previewFailed'),
              description: error.message,
            })
          }
        />
      </div>

      <div className='flex items-center gap-2'>
        <Button type='submit' disabled={saving || uploadStatus === 'uploading'}>
          <SaveIcon data-icon='inline-start' />
          {saving ? t('materials.form.saving') : t('actions.save')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
          disabled={saving}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
