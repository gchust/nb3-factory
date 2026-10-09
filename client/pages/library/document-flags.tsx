import { useTranslation } from '@nocobase/i18n/client';
import { FileLock2Icon, FileTextIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

export interface DocumentFlagsProps {
  readonly published: boolean;
  readonly confidential: boolean;
}

/** The published/draft and confidential badges, shared by the list and the detail drawer. */
export function DocumentFlags({
  published,
  confidential,
}: DocumentFlagsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge variant={published ? 'secondary' : 'outline'}>
        {published ? (
          <FileTextIcon data-icon='inline-start' />
        ) : (
          <FileLock2Icon data-icon='inline-start' />
        )}
        {published ? t('library.status.published') : t('library.status.draft')}
      </Badge>
      {confidential ? (
        <Badge variant='destructive'>{t('library.status.confidential')}</Badge>
      ) : null}
    </div>
  );
}
