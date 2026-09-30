import { useTranslation } from '@nocobase/i18n/client';
import { DownloadIcon } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilePreviewContent } from '@/extensions/nocobase-file-component-ui/components/previewers/file-preview-content.js';
import { resolveFilePreviewKind } from '@/extensions/nocobase-file-component-ui/lib/file-preview.js';

import { errorMessage, formatBytes, type ServiceApi } from '../service-api.js';
import type { ServiceAttachment } from '../types.js';
import { toFileRecord } from './attachment-preview.js';

/**
 * Renders one attachment inside a dialog. The bytes are read through the
 * authenticated client into an object URL, so a DOCX renders here instead of
 * being handed to a new tab the session cookie cannot reach. The object URL is
 * revoked when the selection changes or the dialog closes.
 */
export function AttachmentPreviewDialog({
  api,
  attachment,
  open,
  onOpenChange,
}: {
  readonly api: ServiceApi;
  readonly attachment: ServiceAttachment | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {attachment ? (
        // Keying on the attachment starts a fresh load when the selection
        // changes, so the body never has to reset stale state in an effect.
        <AttachmentPreviewContent
          key={attachment.id}
          api={api}
          attachment={attachment}
        />
      ) : null}
    </Dialog>
  );
}

function AttachmentPreviewContent({
  api,
  attachment,
}: {
  readonly api: ServiceApi;
  readonly attachment: ServiceAttachment;
}): ReactElement {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>();
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const file = toFileRecord(attachment);
  const kind = resolveFilePreviewKind(file);

  useEffect(() => {
    let active = true;
    void api.openAttachment(attachment.id).then(
      async (objectUrl) => {
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
        // A Markdown preview renders text, not bytes; read the object URL as
        // text so the shared preview component has something to show.
        if (kind === 'markdown') {
          try {
            const content = await fetch(objectUrl).then((response) =>
              response.text(),
            );
            if (active) setText(content);
          } catch (reason) {
            if (active) setError(errorMessage(reason));
          }
        }
      },
      (reason: unknown) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [api, attachment.id, kind]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <DialogContent className='sm:max-w-3xl'>
      <DialogHeader>
        <DialogTitle>{attachment.filename}</DialogTitle>
        <DialogDescription>
          {`${attachment.mimeType} · ${formatBytes(attachment.size)}`}
        </DialogDescription>
      </DialogHeader>
      <div className='flex min-h-40 items-center justify-center overflow-auto'>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : (
          <FilePreviewContent
            file={file}
            kind={kind}
            url={url}
            text={kind === 'markdown' ? text : undefined}
          />
        )}
      </div>
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          disabled={!url}
          onClick={() => {
            if (!url) return;
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = attachment.filename;
            anchor.rel = 'noopener';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
          }}
        >
          <DownloadIcon />
          {t('service.attachments.download')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
