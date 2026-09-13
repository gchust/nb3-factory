import type { FileRecord } from '../../types';
import type { FileUiLabels } from '../../types';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  resolveOfficeEmbedUrl,
  type FilePreviewKind,
} from '../../lib/file-preview';
import { Button } from '@/components/ui/button';
import { resolveSafeFileUrl } from '../../lib/file-url';
import { FileThumbnail } from '../file-thumbnail';

const OFFICE_PREVIEW_TIMEOUT_MS = 15_000;

export interface FilePreviewContentProps {
  readonly file: FileRecord;
  readonly kind: FilePreviewKind;
  readonly url?: string;
  readonly text?: string;
  readonly error?: string;
  readonly labels?: FileUiLabels;
  readonly onDownload?: () => void;
}

export function FilePreviewContent({
  file,
  kind,
  url,
  text,
  error,
  labels,
  onDownload,
}: FilePreviewContentProps): ReactElement {
  if (kind === 'office') {
    return (
      <OfficePreview
        file={file}
        url={url}
        error={error}
        labels={labels}
        onDownload={onDownload}
      />
    );
  }
  if (error) return <div role='alert'>{error}</div>;
  if (!url && kind !== 'unsupported')
    return <div role='status'>{labels?.loading ?? 'Loading preview...'}</div>;
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
      return <MarkdownPreview text={text} labels={labels} />;
    case 'text':
      return (
        <pre className='max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'>
          {text ?? labels?.loading ?? 'Loading preview...'}
        </pre>
      );
    default:
      return (
        <DownloadFallback file={file} labels={labels} onDownload={onDownload} />
      );
  }
}

function MarkdownPreview({
  text,
  labels,
}: {
  readonly text?: string;
  readonly labels?: FileUiLabels;
}): ReactElement {
  if (text === undefined)
    return <div role='status'>{labels?.loading ?? 'Loading preview...'}</div>;
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

function OfficePreview({
  file,
  url,
  error,
  labels,
  onDownload,
}: {
  readonly file: FileRecord;
  readonly url?: string;
  readonly error?: string;
  readonly labels?: FileUiLabels;
  readonly onDownload?: () => void;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const embedUrl = url ? resolveOfficeEmbedUrl(url) : undefined;
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !embedUrl) return undefined;
    const handleError = () => setFailed(true);
    iframe.addEventListener('error', handleError);
    return () => iframe.removeEventListener('error', handleError);
  }, [embedUrl]);
  useEffect(() => {
    if (!embedUrl || loaded) return undefined;
    const timeout = window.setTimeout(
      () => setFailed(true),
      OFFICE_PREVIEW_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [embedUrl, loaded]);
  if (!url && !error) return <div role='status'>Loading preview...</div>;
  if (!embedUrl || failed) {
    return (
      <DownloadFallback
        file={file}
        labels={labels}
        message={
          error ??
          (failed
            ? (labels?.officeFailed ??
              'Office Online could not load this file.')
            : (labels?.officeRequiresUrl ??
              'Office Online requires an internet-accessible absolute file URL.'))
        }
        onDownload={onDownload}
      />
    );
  }
  return (
    <iframe
      ref={iframeRef}
      title={file.filename}
      src={embedUrl}
      className='h-[70vh] w-full'
      onLoad={() => setLoaded(true)}
    />
  );
}

function DownloadFallback({
  file,
  labels,
  message = labels?.previewUnavailable ??
    'Preview is unavailable for this file type.',
  onDownload,
}: {
  readonly file: FileRecord;
  readonly labels?: FileUiLabels;
  readonly message?: string;
  readonly onDownload?: () => void;
}): ReactElement {
  return (
    <div className='flex flex-col items-center gap-3 py-8'>
      <div className='h-24 w-24'>
        <FileThumbnail file={file} />
      </div>
      <p>{message}</p>
      {onDownload ? (
        <Button type='button' onClick={onDownload}>
          {labels?.downloadFile ?? 'Download file'}
        </Button>
      ) : null}
    </div>
  );
}
