import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye, FileText } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { FilePreviewDialog } from '@/components/repair/file-preview-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatBytes,
  formatDateTime,
  repairApi,
  type Attachment,
} from '@/lib/repair-api';
import { useApiData } from '@/lib/use-repair';

/**
 * Every attachment the signed-in user may read.
 *
 * This is a file library inside the business system, not a separate preview site: each row belongs to a ticket and
 * the bytes route re-checkes that access on every request.
 */
export default function FilesPage(): ReactElement {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number>();
  const files = useApiData(`repair/files:${keyword}`, (api) =>
    repairApi.files(api, { keyword: keyword || undefined, limit: 100 }),
  );
  const rows: Attachment[] = files.data?.rows ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.files.title', { defaultValue: 'Files and preview' })}
        description={t('repair.files.description', {
          defaultValue:
            'Attachments from tickets you may access. Open one to zoom, rotate or page through a PDF.',
        })}
      />

      <div className='flex items-center gap-2'>
        <Input
          className='w-64'
          placeholder={t('repair.files.search', { defaultValue: 'File name' })}
          aria-label={t('repair.files.search', { defaultValue: 'File name' })}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
      </div>

      <DataState
        loading={files.loading}
        error={files.error}
        empty={rows.length === 0}
        onRetry={files.reload}
      >
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('repair.files.name', { defaultValue: 'File' })}
                </TableHead>
                <TableHead>
                  {t('repair.files.type', { defaultValue: 'Type' })}
                </TableHead>
                <TableHead>
                  {t('repair.files.size', { defaultValue: 'Size' })}
                </TableHead>
                <TableHead>
                  {t('repair.files.uploader', { defaultValue: 'Uploaded by' })}
                </TableHead>
                <TableHead>
                  {t('repair.files.uploadedAt', {
                    defaultValue: 'Uploaded at',
                  })}
                </TableHead>
                <TableHead>
                  {t('repair.files.category', { defaultValue: 'Category' })}
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((file, index) => (
                <TableRow key={file.fileId} data-testid='file-row'>
                  <TableCell className='max-w-[20rem]'>
                    <span className='flex items-center gap-2'>
                      <FileText
                        aria-hidden='true'
                        className='size-4 shrink-0'
                      />
                      <span className='truncate' title={file.filename}>
                        {file.filename}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className='text-sm'>{file.mimeType}</TableCell>
                  <TableCell className='tabular-nums'>
                    {formatBytes(file.size)}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {file.uploadedByName ?? '—'}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {formatDateTime(file.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>
                      {t(`repair.category.${file.category}`, {
                        defaultValue: file.category,
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className='flex items-center gap-1'>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={`${t('repair.files.preview', {
                          defaultValue: 'Preview',
                        })}: ${file.filename}`}
                        onClick={() => setPreviewIndex(index)}
                      >
                        <Eye aria-hidden='true' />
                      </Button>
                      <a
                        className='inline-flex size-9 items-center justify-center rounded-md hover:bg-accent'
                        aria-label={`${t('repair.files.download', {
                          defaultValue: 'Download',
                        })}: ${file.filename}`}
                        href={`${file.contentUrl ?? ''}?download=1`}
                        rel='noopener'
                        download={file.filename}
                      >
                        <Download aria-hidden='true' className='size-4' />
                      </a>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>

      {previewIndex !== undefined ? (
        <FilePreviewDialog
          files={rows}
          initialIndex={previewIndex}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(undefined);
          }}
        />
      ) : null}
    </PageContainer>
  );
}
