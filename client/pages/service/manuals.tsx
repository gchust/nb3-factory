/**
 * Equipment manuals — the source documents behind the repair knowledge.
 *
 * A supervisor adds a document, which is stored through the File Repository and
 * then submitted to the knowledge base for indexing. An engineer reads the
 * manual and opens its source file. Indexing is asynchronous, so each row shows
 * the real state the knowledge base reported rather than assuming it worked.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useService } from '@nocobase/app-client';
import { FilePreviewDialog } from '../../extensions/nocobase-file-component-ui/index.js';

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
  StatusBadge,
} from './parts.js';
import type { ManualView, MeView } from './types.js';

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ManualView | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<ManualView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const canMaintain = me.data?.roles.includes('manager') ?? false;

  const state = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<ManualView>>('/manuals', {
          search: query,
          page,
          pageSize: 20,
        }),
      [api, query, page],
    ),
  );

  const act = async (
    label: string,
    run: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(label);
    try {
      await run();
      state.reload();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(null);
    }
  };

  const sourceRecord = preview?.sourceFile
    ? [
        {
          id: preview.sourceFile.id,
          disk: 'local',
          key: '',
          filename: preview.sourceFile.filename ?? 'manual',
          ext: (preview.sourceFile.ext ?? '').replace(/^\./, ''),
          mimeType: preview.sourceFile.mimeType ?? 'application/octet-stream',
          size: preview.sourceFile.size ?? 0,
          createdAt: preview.createdAt ?? '',
          updatedAt: preview.updatedAt ?? '',
          contentUrl: `/api/service/attachments/${preview.sourceFile.id}/content`,
        },
      ]
    : [];

  return (
    <ServicePage
      title={t('service.manuals.title')}
      description={t('service.manuals.description')}
      actions={
        canMaintain ? (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className='size-4' />
            {t('service.manuals.create')}
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.common.search')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative max-w-sm'>
            <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='ps-8'
              value={search}
              placeholder={t('service.manuals.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setQuery(search);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.manuals.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.manuals.titleColumn')}</TableHead>
                      <TableHead>{t('service.manuals.model')}</TableHead>
                      <TableHead>{t('service.manuals.sourceFile')}</TableHead>
                      <TableHead>{t('service.manuals.indexStatus')}</TableHead>
                      <TableHead>{t('service.manuals.indexedAt')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-medium'>
                          {row.title}
                        </TableCell>
                        <TableCell>{row.equipmentModel ?? '—'}</TableCell>
                        <TableCell>
                          {row.sourceFile ? (
                            <button
                              type='button'
                              className='flex items-center gap-2 text-sm hover:underline'
                              onClick={() => setPreview(row)}
                            >
                              <FileTextIcon className='size-4 text-muted-foreground' />
                              {row.sourceFile.filename}
                            </button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.indexStatus} />
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDateTime(row.indexedAt)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {canMaintain ? (
                            <div className='flex justify-end gap-1'>
                              <Button
                                variant='ghost'
                                size='sm'
                                disabled={busy !== null}
                                onClick={() => {
                                  void act('reindex', () =>
                                    api.post(`/manuals/${row.id}/reindex`),
                                  );
                                }}
                              >
                                <RefreshCwIcon className='size-3.5' />
                                {t('service.manuals.reindex')}
                              </Button>
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('service.common.edit')}
                                onClick={() => setEditing(row)}
                              >
                                <PencilIcon className='size-3.5' />
                              </Button>
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('service.common.delete')}
                                disabled={busy !== null}
                                onClick={() => {
                                  void act('delete', () =>
                                    api.del(`/manuals/${row.id}`),
                                  );
                                }}
                              >
                                <Trash2Icon className='size-3.5' />
                              </Button>
                            </div>
                          ) : (
                            <span className='text-xs text-muted-foreground'>
                              {t('service.manuals.indexMessage')}:{' '}
                              {row.indexMessage ?? '—'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      ) : null}

      <FilePreviewDialog
        files={sourceRecord}
        open={preview !== null}
        onOpenChange={(open) => setPreview(open ? preview : null)}
        onError={(error) => api.report(error)}
      />

      <ManualDialog
        key={editing ? `edit-${editing.id}` : 'create'}
        open={creating || editing !== null}
        manual={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          state.reload();
        }}
      />
    </ServicePage>
  );
}

function ManualDialog({
  manual,
  onOpenChange,
  onSaved,
  open,
}: {
  readonly manual: ManualView | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const files = useService(clientFileRepositoryManagerToken);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      let sourceFileId = manual?.sourceFileId ?? '';
      if (file) {
        const uploaded = await files
          .repository('serviceWorkOrderFiles')
          .uploadOne({ file });
        sourceFileId = uploaded.record.id;
      }
      const payload = {
        title: formText(data, 'title'),
        equipmentModel: formText(data, 'equipmentModel'),
        summary: formText(data, 'summary'),
        ...(sourceFileId ? { sourceFileId } : {}),
      };
      if (!manual && !sourceFileId) {
        throw new Error(t('service.manuals.fileRequired'));
      }
      if (manual) {
        await api.patch(`/manuals/${manual.id}`, payload);
      } else {
        await api.post('/manuals', payload);
      }
      onSaved();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {manual ? t('service.manuals.edit') : t('service.manuals.create')}
            </DialogTitle>
            <DialogDescription>
              {t('service.manuals.dialogHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='manual-title'>
                {t('service.manuals.titleColumn')}
              </FieldLabel>
              <Input
                id='manual-title'
                name='title'
                required
                defaultValue={manual?.title ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='manual-model'>
                {t('service.manuals.model')}
              </FieldLabel>
              <Input
                id='manual-model'
                name='equipmentModel'
                defaultValue={manual?.equipmentModel ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='manual-summary'>
                {t('service.manuals.summary')}
              </FieldLabel>
              <Textarea
                id='manual-summary'
                name='summary'
                rows={3}
                defaultValue={manual?.summary ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel>{t('service.manuals.sourceFile')}</FieldLabel>
              <input
                ref={inputRef}
                type='file'
                className='hidden'
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => inputRef.current?.click()}
                >
                  <UploadIcon className='size-4' />
                  {t('service.manuals.chooseFile')}
                </Button>
                <span className='text-sm text-muted-foreground'>
                  {file?.name ??
                    manual?.sourceFile?.filename ??
                    t('service.common.none')}
                </span>
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
