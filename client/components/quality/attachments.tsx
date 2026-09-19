import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, FileWarning, LoaderCircle, Trash2 } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  attachmentPreviewKind,
  attachmentSelectionError,
  attachmentUrl,
  formatDateTime,
  formatFileSize,
  loadAttachments,
  qualityErrorText,
  removeAttachment,
  uploadAttachment,
  type AttachmentCategory,
  type AttachmentTargetType,
  type QualityAttachment,
} from './lib';
import { ErrorBlock, LoadingBlock } from './parts';
import { PdfPreview } from './pdf-preview';
import { useApiData } from './use-api-data';

export interface AttachmentSectionProps {
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly category: AttachmentCategory;
  readonly title: string;
  readonly hint?: string;
}

/**
 * One attachment group of a business record: upload, metadata list, in-place
 * preview and removal. The server decides `canModify`, so the buttons follow
 * the same rules the API enforces and a stale page cannot bypass them.
 */
export function AttachmentSection({
  targetType,
  targetId,
  category,
  title,
  hint,
}: AttachmentSectionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useApiData(
    (client: ApiClient) =>
      loadAttachments(client, { targetType, targetId, category }),
    `${targetType}|${targetId}|${category}`,
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    readonly done: number;
    readonly total: number;
    readonly current: string;
  }>();
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();

  async function onSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setError(undefined);
    const selectionError = attachmentSelectionError(files);
    if (selectionError) {
      setError(t(selectionError));
      return;
    }
    setBusy(true);
    const failures: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProgress({ done: index, total: files.length, current: file.name });
        try {
          await uploadAttachment(api, { targetType, targetId, category }, file);
        } catch (cause: unknown) {
          failures.push(
            t('quality.attachments.uploadFailed', {
              name: file.name,
              message: qualityErrorText(cause, t),
            }),
          );
        }
      }
    } finally {
      setProgress(undefined);
      setBusy(false);
      if (failures.length > 0) setError(failures.join('；'));
      state.reload();
    }
  }

  async function remove(file: QualityAttachment): Promise<void> {
    setError(undefined);
    try {
      await removeAttachment(api, file.id);
      if (selectedId === file.id) setSelectedId(undefined);
      state.reload();
    } catch (cause: unknown) {
      setError(qualityErrorText(cause, t));
    }
  }

  return (
    <section className='space-y-3 rounded-xl border border-border bg-card p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-heading text-sm font-semibold'>{title}</h3>
        <div className='flex flex-wrap items-center gap-2'>
          {state.data ? (
            <span className='text-xs text-muted-foreground'>
              {t('quality.attachments.count', {
                count: state.data.files.length,
              })}
            </span>
          ) : null}
          {state.data?.canModify ? (
            <>
              <input
                ref={inputRef}
                id={inputId}
                type='file'
                multiple
                className='sr-only'
                aria-label={t('quality.attachments.choose')}
                onChange={(event) => void onSelected(event)}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {t('quality.attachments.choose')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
      <p className='text-xs text-muted-foreground'>
        {t('quality.attachments.limits')}
      </p>

      {progress ? (
        <p
          role='status'
          className='flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground'
        >
          <LoaderCircle aria-hidden='true' className='size-3.5 animate-spin' />
          {t('quality.attachments.uploading', {
            done: progress.done + 1,
            total: progress.total,
            name: progress.current,
          })}
        </p>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {state.loading ? (
        <LoadingBlock label={t('status.loading')} />
      ) : state.error ? (
        <ErrorBlock message={state.error} onRetry={state.reload} />
      ) : (state.data?.files.length ?? 0) === 0 ? (
        <p className='rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground'>
          {t('quality.attachments.empty')}
        </p>
      ) : (
        <AttachmentTable
          files={state.data?.files ?? []}
          canModify={Boolean(state.data?.canModify)}
          selectedId={selectedId}
          onSelect={(file) => setSelectedId(file.id)}
          onRemove={(file) => void remove(file)}
        />
      )}

      {state.data ? (
        <AttachmentPreview
          files={state.data.files}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : null}
    </section>
  );
}

function AttachmentTable({
  files,
  canModify,
  selectedId,
  onSelect,
  onRemove,
}: {
  readonly files: readonly QualityAttachment[];
  readonly canModify: boolean;
  readonly selectedId?: string;
  readonly onSelect: (file: QualityAttachment) => void;
  readonly onRemove: (file: QualityAttachment) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='overflow-x-auto rounded-lg border border-border'>
      <table className='w-full min-w-[40rem] border-collapse text-sm'>
        <thead>
          <tr className='border-b border-border bg-muted/50 text-left'>
            <th className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('quality.attachments.column.name')}
            </th>
            <th className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('quality.attachments.column.size')}
            </th>
            <th className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('quality.attachments.column.uploader')}
            </th>
            <th className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('quality.attachments.column.uploadedAt')}
            </th>
            <th className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('quality.attachments.column.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.id}
              className='border-b border-border/60 last:border-b-0'
            >
              <td className='px-3 py-2'>
                <button
                  type='button'
                  className={
                    selectedId === file.id
                      ? 'text-left text-primary underline-offset-4 hover:underline'
                      : 'text-left underline-offset-4 hover:text-primary hover:underline'
                  }
                  onClick={() => onSelect(file)}
                >
                  {file.filename}
                </button>
              </td>
              <td className='px-3 py-2 text-muted-foreground'>
                {formatFileSize(file.size)}
              </td>
              <td className='px-3 py-2 text-muted-foreground'>
                {file.uploadedByName || file.uploadedById}
              </td>
              <td className='px-3 py-2 text-muted-foreground'>
                {formatDateTime(file.createdAt)}
              </td>
              <td className='px-3 py-2'>
                <div className='flex flex-wrap items-center gap-1'>
                  <Button
                    type='button'
                    variant='outline'
                    size='xs'
                    onClick={() => onSelect(file)}
                  >
                    {t('quality.attachments.preview')}
                  </Button>
                  <Button
                    variant='outline'
                    size='xs'
                    nativeButton={false}
                    render={<a href={attachmentUrl(file.id, true)} />}
                  >
                    <Download aria-hidden='true' />
                    {t('quality.attachments.download')}
                  </Button>
                  {canModify ? (
                    <Button
                      type='button'
                      variant='destructive'
                      size='xs'
                      onClick={() => onRemove(file)}
                    >
                      <Trash2 aria-hidden='true' />
                      {t('quality.attachments.remove')}
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttachmentPreview({
  files,
  selectedId,
  onSelect,
}: {
  readonly files: readonly QualityAttachment[];
  readonly selectedId?: string;
  readonly onSelect: (id: string | undefined) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  // Zoom belongs to the file being previewed; keying it by file id means
  // switching files restores 100% without writing state from an effect.
  const [zoomState, setZoomState] = useState<{
    readonly id?: string;
    readonly value: number;
  }>({ value: 1 });
  const [text, setText] = useState<{
    readonly id: string;
    readonly value?: string;
    readonly error?: boolean;
  }>();
  const selected = files.find((file) => file.id === selectedId);
  const kind = selected ? attachmentPreviewKind(selected) : undefined;
  const previewId = selected?.id;
  const zoom = zoomState.id === previewId ? zoomState.value : 1;

  function setZoom(update: (value: number) => number): void {
    setZoomState((current) => ({
      id: previewId,
      value: update(current.id === previewId ? current.value : 1),
    }));
  }

  useEffect(() => {
    if (!previewId || kind !== 'text') return undefined;
    const controller = new AbortController();
    fetch(attachmentUrl(previewId), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((value) => setText({ id: previewId, value }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setText({ id: previewId, error: true });
      });
    return () => controller.abort();
  }, [previewId, kind]);

  if (!selected) return null;
  const index = files.findIndex((file) => file.id === selected.id);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < files.length - 1;

  return (
    <div className='space-y-2 rounded-lg border border-border bg-muted/20 p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs font-medium'>{selected.filename}</p>
        <div className='flex flex-wrap items-center gap-1'>
          {kind === 'image' ? (
            <>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
              >
                {t('quality.attachments.zoomOut')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
              >
                {t('quality.attachments.zoomIn')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() => setZoom(() => 1)}
              >
                {Math.round(zoom * 100)}%
              </Button>
            </>
          ) : null}
          <Button
            type='button'
            variant='outline'
            size='xs'
            disabled={!hasPrev}
            onClick={() => onSelect(files[index - 1]?.id)}
          >
            {t('quality.attachments.previous')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='xs'
            disabled={!hasNext}
            onClick={() => onSelect(files[index + 1]?.id)}
          >
            {t('quality.attachments.next')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='xs'
            onClick={() => onSelect(undefined)}
          >
            {t('quality.attachments.closePreview')}
          </Button>
        </div>
      </div>

      {kind === 'image' ? (
        <div className='max-h-[60vh] overflow-auto rounded-md bg-background p-2'>
          <img
            src={attachmentUrl(selected.id)}
            alt={selected.filename}
            style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: 'none' }}
            className='block'
          />
        </div>
      ) : kind === 'pdf' ? (
        <PdfPreview
          key={selected.id}
          fileId={selected.id}
          filename={selected.filename}
        />
      ) : kind === 'text' ? (
        text?.id === selected.id && text.value !== undefined ? (
          <pre className='max-h-[60vh] overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap'>
            {text.value}
          </pre>
        ) : text?.id === selected.id && text.error ? (
          <ErrorBlock message={t('quality.attachments.previewFailed')} />
        ) : (
          <LoadingBlock label={t('status.loading')} />
        )
      ) : (
        <div className='flex flex-col items-start gap-2 rounded-md bg-background p-3 text-xs text-muted-foreground'>
          <span className='flex items-center gap-2'>
            <FileWarning aria-hidden='true' className='size-4' />
            {t('quality.attachments.unsupported')}
          </span>
          <Button
            variant='outline'
            size='xs'
            nativeButton={false}
            render={<a href={attachmentUrl(selected.id, true)} />}
          >
            <Download aria-hidden='true' />
            {t('quality.attachments.download')}
          </Button>
        </div>
      )}
    </div>
  );
}
