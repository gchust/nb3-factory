import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import type { LibraryDocument } from './types.js';

export interface DocumentDetailSheetProps {
  readonly document: LibraryDocument | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function DetailRow({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex items-start justify-between gap-6 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right'>{children}</span>
    </div>
  );
}

/**
 * The read view: the full body of one document, plus the state that decides
 * who may see it. A reader sees the same surface without the edit controls,
 * which is how "may read" stays visibly different from "may edit".
 */
export function DocumentDetailSheet({
  document,
  open,
  onOpenChange,
}: DocumentDetailSheetProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full gap-0 overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{document?.title ?? ''}</SheetTitle>
          <SheetDescription>{t('library.view.description')}</SheetDescription>
        </SheetHeader>
        {document ? (
          <div className='space-y-4 px-4 pb-6'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant={document.published ? 'default' : 'outline'}>
                {document.published
                  ? t('library.status.published')
                  : t('library.status.draft')}
              </Badge>
              {document.confidential ? (
                <Badge variant='destructive'>
                  {t('library.status.confidential')}
                </Badge>
              ) : null}
              {!document.canEdit ? (
                <Badge variant='secondary'>{t('library.view.readOnly')}</Badge>
              ) : null}
            </div>
            <Separator />
            <DetailRow label={t('library.columns.owner')}>
              {document.ownerName ?? document.ownerId}
            </DetailRow>
            <DetailRow label={t('library.view.created')}>
              {formatTime(document.createdAt)}
            </DetailRow>
            <DetailRow label={t('library.view.updated')}>
              {formatTime(document.updatedAt)}
            </DetailRow>
            <Separator />
            <div className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('library.view.body')}</h3>
              <p className='text-sm leading-6 whitespace-pre-wrap text-foreground'>
                {document.content?.trim()
                  ? document.content
                  : t('library.view.emptyBody')}
              </p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
