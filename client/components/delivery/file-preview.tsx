import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatBytes,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableText,
  type DeliveryFile,
} from '@/lib/delivery';

import { PdfPreview } from './pdf-preview.js';

export interface FilePreviewDialogProps {
  readonly file: DeliveryFile | null;
  readonly onClose: () => void;
}

export function FilePreviewDialog({
  file,
  onClose,
}: FilePreviewDialogProps): ReactElement {
  const { t } = useTranslation();
  const showText = Boolean(file && isPreviewableText(file));
  const textQuery = useQuery({
    queryKey: ['delivery-file-text', file?.id ?? ''],
    enabled: showText,
    retry: false,
    queryFn: async () => {
      const response = await fetch(file!.contentUrl);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.text()).slice(0, 20000);
    },
  });

  const fileLabel = file
    ? `${formatBytes(file.size)} · ${file.mimeType || t('delivery.file.unknownType')}`
    : '';

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='break-all'>{file?.filename}</DialogTitle>
          <DialogDescription>{fileLabel}</DialogDescription>
        </DialogHeader>
        <div className='min-h-32 overflow-hidden rounded-lg border border-border bg-muted/30'>
          {file && isPreviewableImage(file) ? (
            <img
              alt={file.filename}
              className='mx-auto max-h-[60vh] object-contain'
              src={file.contentUrl}
            />
          ) : null}
          {file && isPreviewablePdf(file) ? (
            <PdfPreview
              key={file.id}
              filename={file.filename}
              url={file.contentUrl}
            />
          ) : null}
          {file && showText && textQuery.data !== undefined ? (
            <pre className='max-h-[60vh] overflow-auto p-3 text-xs whitespace-pre-wrap'>
              {textQuery.data}
            </pre>
          ) : null}
          {file && showText && textQuery.isError ? (
            <p className='p-4 text-sm text-destructive'>
              {t('delivery.file.previewFailed')}
            </p>
          ) : null}
          {file &&
          !isPreviewableImage(file) &&
          !isPreviewablePdf(file) &&
          !isPreviewableText(file) ? (
            <p className='p-6 text-center text-sm text-muted-foreground'>
              {t('delivery.file.noPreview')}
            </p>
          ) : null}
        </div>
        <DialogFooter showCloseButton>
          {file ? (
            <Button
              nativeButton={false}
              render={<a download={file.filename} href={file.contentUrl} />}
              variant='outline'
            >
              <Download />
              {t('delivery.file.download')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
