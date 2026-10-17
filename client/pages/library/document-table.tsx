import { useTranslation } from '@nocobase/i18n/client';
import { FileTextIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

import { StatusBadge } from '#components/status-badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import type { LibraryDocument } from './types.js';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface DocumentTableProps {
  readonly documents: readonly LibraryDocument[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly renderActions?: (document: LibraryDocument) => ReactNode;
}

export function DocumentTable({
  documents,
  emptyTitle,
  emptyDescription,
  renderActions,
}: DocumentTableProps): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  if (!documents.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className='overflow-hidden rounded-xl border bg-card'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='pl-4'>{t('library.columns.title')}</TableHead>
            <TableHead>{t('library.columns.owner')}</TableHead>
            <TableHead>{t('library.columns.visibility')}</TableHead>
            <TableHead>{t('library.columns.updatedAt')}</TableHead>
            {renderActions ? (
              <TableHead className='pr-4 text-right'>
                {t('library.columns.actions')}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className='max-w-80 pl-4 whitespace-normal'>
                <Link
                  className='font-medium underline-offset-4 hover:underline'
                  to={{
                    pathname: document.id,
                    search: location.search,
                  }}
                >
                  {document.title}
                </Link>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {document.ownerName || '—'}
              </TableCell>
              <TableCell>
                <span className='flex flex-wrap gap-1'>
                  <StatusBadge
                    tone={document.published ? 'success' : 'neutral'}
                  >
                    {document.published
                      ? t('library.visibility.published')
                      : t('library.visibility.draft')}
                  </StatusBadge>
                  {document.confidential ? (
                    <StatusBadge tone='warning'>
                      {t('library.visibility.confidential')}
                    </StatusBadge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {dateFormat.format(new Date(document.updatedAt))}
              </TableCell>
              {renderActions ? (
                <TableCell className='pr-4 text-right'>
                  {renderActions(document)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
