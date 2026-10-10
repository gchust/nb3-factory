import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

export interface LibraryDocumentBadgesProps {
  readonly published: boolean;
  readonly confidential: boolean;
}

/** The two independent flags that decide a document's visibility. */
export function LibraryDocumentBadges({
  confidential,
  published,
}: LibraryDocumentBadgesProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge variant={published ? 'secondary' : 'outline'}>
        {published ? t('library.status.published') : t('library.status.draft')}
      </Badge>
      {confidential ? (
        <Badge variant='destructive'>
          <LockIcon />
          {t('library.status.confidential')}
        </Badge>
      ) : null}
    </div>
  );
}
