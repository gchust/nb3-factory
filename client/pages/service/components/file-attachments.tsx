import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import { toast } from 'sonner';

import {
  FilePreviewField,
  FileUploadField,
  type ClientFileRepository,
  type FileUiLabels,
} from '../../../extensions/nocobase-file-component-ui/index.js';

import { decorateFiles } from '../lib/files.js';
import type { ServiceFile } from '../lib/types.js';

export function FileAttachments({
  files,
  repository,
  canUpload = false,
  onUploaded,
  onError,
}: {
  readonly files: readonly ServiceFile[];
  readonly repository?: ClientFileRepository;
  readonly canUpload?: boolean;
  readonly onUploaded?: (fileIds: readonly string[]) => void | Promise<void>;
  readonly onError?: (error: Error) => void;
}): ReactElement {
  const { t } = useTranslation();
  const decorated = useMemo(() => decorateFiles(files), [files]);
  const handleError = (error: Error): void => {
    toast.error(error.message || t('service.files.uploadFailed'));
    onError?.(error);
  };
  const labels: FileUiLabels = {
    choose: t('service.files.choose'),
    empty: t('service.files.empty'),
    preview: t('service.files.preview'),
    download: t('service.files.download'),
    remove: t('service.files.remove'),
    retry: t('service.files.retry'),
  };

  return (
    <div className='space-y-4'>
      {decorated.length ? (
        <FilePreviewField
          allowDownload
          files={decorated}
          labels={labels}
          showFilenames
          onError={handleError}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('service.files.empty')}
        </p>
      )}
      {canUpload && repository ? (
        <FileUploadField
          accept={[
            'image/png',
            'image/jpeg',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          ]}
          labels={labels}
          maxSize={20 * 1024 * 1024}
          multiple
          onChange={(records) => {
            if (!records.length || !onUploaded) return;
            void onUploaded(records.map((record) => record.id));
          }}
          onError={handleError}
          repository={repository}
          value={[]}
        />
      ) : null}
    </div>
  );
}
