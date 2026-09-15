import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  deleteDocument,
  errorCode,
  fetchCapabilities,
  fetchDocuments,
  updateDocument,
} from '@/components/document-library/api.js';
import { SelectInput } from '@/components/document-library/controls.js';
import { DocumentPreview } from '@/components/document-library/preview.js';
import { errorDescriptor } from '@/components/document-library/messages.js';
import {
  FALLBACK_CAPABILITIES,
  canPreviewInPage,
  fileTypeLabel,
  formatBytes,
  formatDateTime,
  isImage,
  type DocumentFilters,
  type DocumentRecord,
} from '@/components/document-library/types.js';
import { DocumentUploader } from '@/components/document-library/uploader.js';

interface Filters {
  readonly discipline: string;
  readonly drawingNumber: string;
  readonly name: string;
}

interface EditDraft {
  readonly drawingNumber: string;
  readonly name: string;
  readonly discipline: string;
  readonly version: string;
  readonly status: string;
}

const EMPTY_FILTERS: Filters = { discipline: '', drawingNumber: '', name: '' };
const EMPTY_RECORDS: readonly DocumentRecord[] = [];

function toQueryFilters(filters: Filters): DocumentFilters {
  return {
    ...(filters.discipline ? { discipline: filters.discipline } : {}),
    ...(filters.drawingNumber ? { drawingNumber: filters.drawingNumber } : {}),
    ...(filters.name ? { name: filters.name } : {}),
  };
}

export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState<Filters>(EMPTY_FILTERS);
  const [preview, setPreview] = useState<DocumentRecord>();
  const [editing, setEditing] = useState<
    { readonly record: DocumentRecord; readonly draft: EditDraft } | undefined
  >();
  const [confirmId, setConfirmId] = useState<string>();
  const [actionErrorKey, setActionErrorKey] = useState<string>();

  const capabilitiesQuery = useQuery({
    queryKey: ['document-library', 'capabilities'],
    queryFn: () => fetchCapabilities(api),
    retry: false,
  });
  const capabilities = capabilitiesQuery.data ?? FALLBACK_CAPABILITIES;
  const denied =
    capabilitiesQuery.isError &&
    errorCode(capabilitiesQuery.error) === 'FORBIDDEN';

  const documentsQuery = useQuery({
    queryKey: ['document-library', 'documents', query],
    queryFn: () => fetchDocuments(api, toQueryFilters(query)),
    retry: false,
    enabled: capabilitiesQuery.isSuccess,
  });
  const records = documentsQuery.data ?? EMPTY_RECORDS;
  const loading = documentsQuery.isPending;
  const errorKey =
    actionErrorKey ??
    (documentsQuery.isError
      ? (errorCode(documentsQuery.error) ?? 'generic')
      : undefined);

  // Debounce the text filters so typing does not issue a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters), 250);
    return () => clearTimeout(timer);
  }, [filters]);

  const reload = async (): Promise<void> => {
    await documentsQuery.refetch();
  };

  const openEdit = (record: DocumentRecord): void => {
    setEditing({
      record,
      draft: {
        drawingNumber: record.drawingNumber ?? '',
        name: record.name ?? '',
        discipline: record.discipline ?? capabilities.disciplines[0] ?? '',
        version: record.version ?? '',
        status: record.status ?? 'active',
      },
    });
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    setActionErrorKey(undefined);
    try {
      await updateDocument(api, editing.record.id, {
        drawingNumber: editing.draft.drawingNumber,
        name: editing.draft.name,
        discipline: editing.draft.discipline,
        version: editing.draft.version,
        status: editing.draft.status,
      });
      setEditing(undefined);
      await reload();
    } catch (error) {
      setActionErrorKey(errorCode(error) ?? 'generic');
    }
  };

  const remove = async (id: string): Promise<void> => {
    setActionErrorKey(undefined);
    try {
      await deleteDocument(api, id);
      setConfirmId(undefined);
      await reload();
    } catch (error) {
      setActionErrorKey(errorCode(error) ?? 'generic');
    }
  };

  const currentError = useMemo(
    () => errorDescriptor(errorKey, capabilities),
    [capabilities, errorKey],
  );

  if (denied) {
    return (
      <section className='mx-auto w-full max-w-6xl space-y-4 p-6'>
        <h1 className='text-2xl font-semibold'>{t('documents.title')}</h1>
        <p role='alert' className='text-sm text-destructive'>
          {t('documents.errors.FORBIDDEN')}
        </p>
      </section>
    );
  }

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <header className='space-y-1'>
        <h1 className='text-2xl font-semibold'>{t('documents.title')}</h1>
        <p className='text-sm text-muted-foreground'>
          {t('documents.subtitle')}
        </p>
      </header>

      {capabilities.canUpload ? (
        <DocumentUploader
          api={api}
          capabilities={capabilities}
          onUploaded={() => void reload()}
        />
      ) : null}

      <section className='space-y-3' aria-label={t('documents.filters.title')}>
        <div className='grid gap-3 sm:grid-cols-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='document-filter-discipline'>
              {t('documents.filters.discipline')}
            </Label>
            <SelectInput
              id='document-filter-discipline'
              value={filters.discipline}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  discipline: event.currentTarget.value,
                })
              }
            >
              <option value=''>{t('documents.filters.all')}</option>
              {capabilities.disciplines.map((option) => (
                <option key={option} value={option}>
                  {t(`documents.discipline.${option}`, {
                    defaultValue: option,
                  })}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='document-filter-drawing'>
              {t('documents.filters.drawingNumber')}
            </Label>
            <Input
              id='document-filter-drawing'
              value={filters.drawingNumber}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  drawingNumber: event.currentTarget.value,
                })
              }
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='document-filter-name'>
              {t('documents.filters.name')}
            </Label>
            <Input
              id='document-filter-name'
              value={filters.name}
              onChange={(event) =>
                setFilters({ ...filters, name: event.currentTarget.value })
              }
            />
          </div>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setFilters(EMPTY_FILTERS)}
        >
          {t('documents.filters.reset')}
        </Button>
      </section>

      {errorKey ? (
        <p role='alert' className='text-sm text-destructive'>
          {t(currentError.key, currentError.options)}
        </p>
      ) : null}

      {editing ? (
        <section className='space-y-3 rounded-lg border border-border bg-card p-4'>
          <h2 className='text-base font-semibold'>
            {t('documents.list.edit')} · {editing.record.filename}
          </h2>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='document-edit-drawing'>
                {t('documents.list.drawingNumber')}
              </Label>
              <Input
                id='document-edit-drawing'
                value={editing.draft.drawingNumber}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      drawingNumber: event.currentTarget.value,
                    },
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='document-edit-name'>
                {t('documents.list.name')}
              </Label>
              <Input
                id='document-edit-name'
                value={editing.draft.name}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      name: event.currentTarget.value,
                    },
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='document-edit-discipline'>
                {t('documents.list.discipline')}
              </Label>
              <SelectInput
                id='document-edit-discipline'
                value={editing.draft.discipline}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      discipline: event.currentTarget.value,
                    },
                  })
                }
              >
                {capabilities.disciplines.map((option) => (
                  <option key={option} value={option}>
                    {t(`documents.discipline.${option}`, {
                      defaultValue: option,
                    })}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='document-edit-version'>
                {t('documents.list.version')}
              </Label>
              <Input
                id='document-edit-version'
                value={editing.draft.version}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      version: event.currentTarget.value,
                    },
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='document-edit-status'>
                {t('documents.list.status')}
              </Label>
              <SelectInput
                id='document-edit-status'
                value={editing.draft.status}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      status: event.currentTarget.value,
                    },
                  })
                }
              >
                {capabilities.statuses.map((option) => (
                  <option key={option} value={option}>
                    {t(`documents.status.${option}`, { defaultValue: option })}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
          <div className='flex gap-2'>
            <Button type='button' onClick={() => void saveEdit()}>
              {t('documents.list.save')}
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => setEditing(undefined)}
            >
              {t('documents.list.cancel')}
            </Button>
          </div>
        </section>
      ) : null}

      {preview ? (
        <DocumentPreview
          key={preview.id}
          record={preview}
          onClose={() => setPreview(undefined)}
        />
      ) : null}

      <section className='space-y-3' aria-label={t('documents.list.title')}>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='text-base font-semibold'>
            {t('documents.list.title')}
          </h2>
          <span className='text-sm text-muted-foreground'>
            {t('documents.list.total', { count: records.length })}
          </span>
        </div>

        {loading ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('documents.list.loading')}
          </p>
        ) : records.length === 0 ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('documents.list.empty')}
          </p>
        ) : (
          <div className='overflow-x-auto rounded-lg border border-border'>
            <table className='w-full border-collapse text-sm'>
              <thead className='bg-muted/40 text-left'>
                <tr>
                  <th className='p-2'>{t('documents.list.fileName')}</th>
                  <th className='p-2'>{t('documents.list.type')}</th>
                  <th className='p-2'>{t('documents.list.size')}</th>
                  <th className='p-2'>{t('documents.list.drawingNumber')}</th>
                  <th className='p-2'>{t('documents.list.name')}</th>
                  <th className='p-2'>{t('documents.list.discipline')}</th>
                  <th className='p-2'>{t('documents.list.version')}</th>
                  <th className='p-2'>{t('documents.list.status')}</th>
                  <th className='p-2'>{t('documents.list.uploadedBy')}</th>
                  <th className='p-2'>{t('documents.list.uploadedAt')}</th>
                  <th className='p-2'>{t('documents.list.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className='border-t border-border align-top'
                  >
                    <td className='p-2'>
                      <div className='flex items-center gap-2'>
                        {isImage(record) && capabilities.canDownload ? (
                          <img
                            src={record.contentUrl}
                            alt={record.filename}
                            data-slot='document-thumbnail'
                            className='h-10 w-10 shrink-0 rounded border border-border object-cover'
                          />
                        ) : (
                          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-muted-foreground'>
                            <FileText aria-hidden='true' className='size-4' />
                          </span>
                        )}
                        <span className='truncate' title={record.filename}>
                          {record.filename}
                        </span>
                      </div>
                    </td>
                    <td className='p-2'>{fileTypeLabel(record)}</td>
                    <td className='p-2'>{formatBytes(record.size)}</td>
                    <td className='p-2'>{record.drawingNumber ?? '—'}</td>
                    <td className='p-2'>{record.name ?? '—'}</td>
                    <td className='p-2'>
                      {record.discipline
                        ? t(`documents.discipline.${record.discipline}`, {
                            defaultValue: record.discipline,
                          })
                        : '—'}
                    </td>
                    <td className='p-2'>{record.version ?? '—'}</td>
                    <td className='p-2'>
                      {record.status
                        ? t(`documents.status.${record.status}`, {
                            defaultValue: record.status,
                          })
                        : '—'}
                    </td>
                    <td className='p-2'>{record.uploadedByName ?? '—'}</td>
                    <td className='p-2'>{formatDateTime(record.createdAt)}</td>
                    <td className='p-2'>
                      <div className='flex flex-wrap gap-1'>
                        {/* Preview streams file content, so it needs the same download grant as the content route. */}
                        {capabilities.canDownload &&
                        canPreviewInPage(record) ? (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => setPreview(record)}
                          >
                            {t('documents.list.preview')}
                          </Button>
                        ) : null}
                        {capabilities.canDownload ? (
                          <a
                            href={record.contentUrl}
                            download={record.filename}
                            className='inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted'
                          >
                            {t('documents.list.download')}
                          </a>
                        ) : null}
                        {capabilities.canUpdate ? (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => openEdit(record)}
                          >
                            {t('documents.list.edit')}
                          </Button>
                        ) : null}
                        {capabilities.canDelete ? (
                          confirmId === record.id ? (
                            <Button
                              type='button'
                              variant='destructive'
                              size='sm'
                              onClick={() => void remove(record.id)}
                            >
                              {t('documents.list.confirmDelete')}
                            </Button>
                          ) : (
                            <Button
                              type='button'
                              variant='destructive'
                              size='sm'
                              onClick={() => setConfirmId(record.id)}
                            >
                              {t('documents.list.delete')}
                            </Button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
