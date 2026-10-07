import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';

import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import {
  createDocument,
  documentCenterErrorKey,
  listDepartments,
  updateDocument,
  type Department,
  type DocumentCategory,
  type DocumentDetail,
  type DocumentStatus,
  type DocumentVisibility,
} from '@/lib/document-center';

/** The list page's outlet context, through which a saved document refreshes the list under the dialog. */
export interface DocumentListOutletContext {
  readonly reload: () => void;
}

const CATEGORIES: readonly DocumentCategory[] = [
  'handbook',
  'policy',
  'template',
];
const STATUSES: readonly DocumentStatus[] = ['draft', 'published'];
const VISIBILITIES: readonly DocumentVisibility[] = ['all', 'departments'];

export function DocumentForm({
  document,
}: {
  readonly document?: DocumentDetail;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DocumentListOutletContext>();

  const [departments, setDepartments] = useState<readonly Department[]>([]);
  const [title, setTitle] = useState(document?.title ?? '');
  const [code, setCode] = useState(document?.code ?? '');
  const [category, setCategory] = useState<DocumentCategory>(
    document?.category ?? 'policy',
  );
  const [summary, setSummary] = useState(document?.summary ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const [status, setStatus] = useState<DocumentStatus>(
    document?.status ?? 'draft',
  );
  const [visibility, setVisibility] = useState<DocumentVisibility>(
    document?.visibility ?? 'all',
  );
  const [departmentIds, setDepartmentIds] = useState<readonly number[]>(
    document?.departmentIds ?? [],
  );
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    listDepartments(api, controller.signal).then(
      (items) => {
        if (!controller.signal.aborted) setDepartments(items);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  function toggleDepartment(departmentId: number, checked: boolean): void {
    setDepartmentIds((current) =>
      checked
        ? [...current, departmentId]
        : current.filter((id) => id !== departmentId),
    );
  }

  async function submit(): Promise<void> {
    if (title.trim() === '' || content.trim() === '') {
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    const values = {
      title: title.trim(),
      code: code.trim() === '' ? null : code.trim(),
      category,
      summary: summary.trim() === '' ? null : summary.trim(),
      content,
      status,
      visibility,
      departmentIds: visibility === 'departments' ? departmentIds : [],
      changeNote: changeNote.trim() === '' ? null : changeNote.trim(),
    };
    try {
      if (document) {
        await updateDocument(api, document.id, {
          ...values,
          expectedVersion: document.version,
        });
      } else {
        await createDocument(api, values);
      }
      toaster.show({
        type: 'success',
        title: t(
          document
            ? 'documentsAdmin.form.updated'
            : 'documentsAdmin.form.created',
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
        <Label htmlFor='document-title'>{t('documentsAdmin.form.title')}</Label>
        <Input
          id='document-title'
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='document-code'>{t('documentsAdmin.form.code')}</Label>
          <Input
            id='document-code'
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='document-category'>
            {t('documentsAdmin.form.category')}
          </Label>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(String(value) as DocumentCategory)
            }
          >
            <SelectTrigger id='document-category' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`documents.category.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='document-summary'>
          {t('documentsAdmin.form.summary')}
        </Label>
        <Textarea
          id='document-summary'
          value={summary}
          rows={2}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='document-content'>
          {t('documentsAdmin.form.content')}
        </Label>
        <Textarea
          id='document-content'
          value={content}
          rows={10}
          required
          className='font-mono text-sm'
          onChange={(event) => setContent(event.target.value)}
        />
        <p className='text-xs text-muted-foreground'>
          {t('documentsAdmin.form.contentHint')}
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='document-status'>
            {t('documentsAdmin.form.status')}
          </Label>
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(String(value) as DocumentStatus)
            }
          >
            <SelectTrigger id='document-status' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`documents.status.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='document-visibility'>
            {t('documentsAdmin.form.visibility')}
          </Label>
          <Select
            value={visibility}
            onValueChange={(value) =>
              setVisibility(String(value) as DocumentVisibility)
            }
          >
            <SelectTrigger id='document-visibility' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`documents.visibility.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visibility === 'departments' ? (
        <div className='space-y-2'>
          <Label>{t('documentsAdmin.form.departments')}</Label>
          <p className='text-xs text-muted-foreground'>
            {t('documentsAdmin.form.departmentsHint')}
          </p>
          {departments.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('documentsAdmin.departments.empty')}
            </p>
          ) : (
            <div className='grid gap-2 rounded-lg border p-3 sm:grid-cols-2'>
              {departments.map((department) => (
                <label
                  key={department.id}
                  className='flex items-center gap-2 text-sm'
                >
                  <Checkbox
                    checked={departmentIds.includes(department.id)}
                    onCheckedChange={(checked) =>
                      toggleDepartment(department.id, checked === true)
                    }
                  />
                  <span>{department.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className='space-y-2'>
        <Label htmlFor='document-change-note'>
          {t('documentsAdmin.form.changeNote')}
        </Label>
        <Input
          id='document-change-note'
          value={changeNote}
          placeholder={t('documentsAdmin.form.changeNotePlaceholder')}
          onChange={(event) => setChangeNote(event.target.value)}
        />
      </div>

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
          {document ? t('actions.save') : t('documentsAdmin.form.create')}
        </Button>
      </div>
    </form>
  );
}
