import { useService, apiClientToken } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, FileText } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import {
  listResourceFiles,
  type FileRecordView,
} from '@/lib/resource-files-api';
import {
  formatFileSize,
  fileSizeUnits,
  resolveFileUrl,
} from '@/lib/file-utils';

export default function FilesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [files, setFiles] = useState<readonly FileRecordView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listResourceFiles(api)
      .then((records) => {
        if (active) setFiles(records);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const units = fileSizeUnits(t);

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('files.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('files.description')}
        </p>
      </header>

      {failed ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('files.loadError')}
        </p>
      ) : files === null ? (
        <Loading label={t('files.loading')} />
      ) : files.length === 0 ? (
        <div
          role='status'
          className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'
        >
          {t('files.empty')}
        </div>
      ) : (
        <ul className='divide-y overflow-hidden rounded-lg border'>
          {files.map((file) => {
            const url = resolveFileUrl(file.contentUrl);
            return (
              <li
                key={file.id}
                className='flex flex-wrap items-center gap-3 p-3'
              >
                <FileText
                  aria-hidden='true'
                  className='size-5 shrink-0 text-muted-foreground'
                />
                <div className='min-w-0 flex-1'>
                  <p
                    className='truncate text-sm font-medium'
                    title={file.filename}
                  >
                    {file.filename}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatFileSize(Number(file.size), units)} · {file.mimeType}
                  </p>
                </div>
                {url ? (
                  <a
                    href={url}
                    download={file.filename}
                    className='inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline'
                  >
                    <Download aria-hidden='true' className='size-4' />
                    {t('files.download')}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
