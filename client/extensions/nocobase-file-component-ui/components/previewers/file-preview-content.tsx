// Materialized from @nocobase/app-plugin-file registry item `component-ui`.
// Application-owned source; the Office Online branch of the published copy was
// removed because this application offers such files as a download instead.

import { messageKey } from '../../lib/message-key.js';
import { useTranslation } from '@nocobase/i18n/client';
import type { FileRecord } from '../../types';
import { type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { FilePreviewKind } from '../../lib/file-preview';
import { Button } from '@/components/ui/button';
import { resolveSafeFileUrl } from '../../lib/file-url';
import { FileThumbnail } from '../file-thumbnail';

export interface FilePreviewContentProps {
  readonly file: FileRecord;
  readonly kind: FilePreviewKind;
  readonly url?: string;
  readonly text?: string;
  readonly error?: string;
  readonly onDownload?: () => void;
}

export function FilePreviewContent(
  inputProps: FilePreviewContentProps,
): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const { file, kind, url, text, error, onDownload } = inputProps;

  if (error)
    return (
      <div role='alert'>{t(messageKey(error), { defaultValue: error })}</div>
    );
  if (!url && kind !== 'unsupported')
    return (
      <div role='status'>
        {t('files.loadingPreview', { defaultValue: 'Loading preview...' })}
      </div>
    );
  switch (kind) {
    case 'image':
      return (
        <img
          src={url}
          alt={file.filename}
          className='max-h-[70vh] max-w-full object-contain'
        />
      );
    case 'pdf':
      return (
        <iframe title={file.filename} src={url} className='h-[70vh] w-full' />
      );
    case 'audio':
      return <audio controls src={url} className='w-full' />;
    case 'video':
      return <video controls src={url} className='max-h-[70vh] max-w-full' />;
    case 'markdown':
      return <MarkdownPreview text={text} />;
    case 'text':
      return (
        <pre className='max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'>
          {text ??
            t('files.loadingPreview', { defaultValue: 'Loading preview...' })}
        </pre>
      );
    default:
      return <DownloadFallback file={file} onDownload={onDownload} />;
  }
}

function MarkdownPreview(inputProps: { readonly text?: string }): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const { text } = inputProps;

  if (text === undefined)
    return (
      <div role='status'>
        {t('files.loadingPreview', { defaultValue: 'Loading preview...' })}
      </div>
    );
  return (
    <article className='prose max-h-[70vh] max-w-none overflow-auto rounded-md bg-muted/30 p-4'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => resolveSafeFileUrl(url) ?? ''}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target='_blank' rel='noreferrer'>
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </article>
  );
}

function DownloadFallback(inputProps: {
  readonly file: FileRecord;
  readonly message?: string;
  readonly onDownload?: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file');
  const {
    file,
    message = t('files.previewUnavailable', {
      defaultValue: 'Preview is unavailable for this file type.',
    }),
    onDownload,
  } = inputProps;

  return (
    <div className='flex flex-col items-center gap-3 py-8'>
      <div className='h-24 w-24'>
        <FileThumbnail file={file} />
      </div>
      <p>{message}</p>
      {onDownload ? (
        <Button type='button' onClick={onDownload}>
          {t('files.downloadFile', { defaultValue: 'Download file' })}
        </Button>
      ) : null}
    </div>
  );
}
