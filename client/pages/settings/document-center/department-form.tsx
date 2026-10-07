import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  createDepartment,
  documentCenterErrorKey,
  updateDepartment,
  type Department,
} from '@/lib/document-center';

/** The departments page's outlet context, through which a saved department refreshes the list. */
export interface DepartmentListOutletContext {
  readonly reload: () => void;
}

export function DepartmentForm({
  department,
}: {
  readonly department?: Department;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DepartmentListOutletContext>();

  const [code, setCode] = useState(department?.code ?? '');
  const [title, setTitle] = useState(department?.title ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [active, setActive] = useState(department?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    if (title.trim() === '' || (!department && code.trim() === '')) {
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (department) {
        await updateDepartment(api, department.id, {
          title: title.trim(),
          description: description.trim() === '' ? null : description.trim(),
          active,
        });
      } else {
        await createDepartment(api, {
          code: code.trim(),
          title: title.trim(),
          description: description.trim() === '' ? null : description.trim(),
        });
      }
      toaster.show({
        type: 'success',
        title: t(
          department
            ? 'documentsAdmin.departments.updated'
            : 'documentsAdmin.departments.created',
        ),
      });
      reload();
      await close();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className='space-y-4'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : null}

      <div className='space-y-2'>
        <Label htmlFor='department-code'>
          {t('documentsAdmin.departments.column.code')}
        </Label>
        <Input
          id='department-code'
          value={code}
          required
          disabled={department !== undefined}
          onChange={(event) => setCode(event.target.value)}
        />
        <p className='text-xs text-muted-foreground'>
          {t('documentsAdmin.departments.codeHint')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='department-title'>
          {t('documentsAdmin.departments.column.title')}
        </Label>
        <Input
          id='department-title'
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='department-description'>
          {t('documentsAdmin.departments.column.description')}
        </Label>
        <Textarea
          id='department-description'
          value={description}
          rows={2}
          placeholder={t('documentsAdmin.departments.descriptionHint')}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={active}
          onCheckedChange={(checked) => setActive(checked === true)}
        />
        {t('documentsAdmin.departments.activeHint')}
      </label>

      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            void close();
          }}
        >
          {t('actions.cancel')}
        </Button>
        <Button type='submit' disabled={saving}>
          {saving ? <Spinner /> : null}
          {department
            ? t('actions.save')
            : t('documentsAdmin.departments.create')}
        </Button>
      </div>
    </form>
  );
}
