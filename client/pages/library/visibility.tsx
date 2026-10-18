import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

/**
 * A document's visibility as text, never colour alone: whether it is published
 * and whether it is confidential are two independent facts, so they are two
 * badges. The library uses the same two words everywhere, which is why this is
 * one component rather than a badge built inline on each page.
 */
export function DocumentVisibility({
  published,
  confidential,
}: {
  readonly published: boolean;
  readonly confidential: boolean;
}): ReactElement {
  const { t } = useTranslation();
  // Inline, not a `div`: this sits inside the detail page's `PageHeader` description, which is a `<p>`. A block
  // element there is invalid HTML and makes the hydration mismatch React warns about on every document page.
  return (
    <span className='flex flex-wrap items-center gap-1.5'>
      <StatusBadge tone={published ? 'success' : 'neutral'}>
        {published
          ? t('library.visibility.published')
          : t('library.visibility.draft')}
      </StatusBadge>
      {confidential ? (
        <StatusBadge tone='warning'>
          {t('library.visibility.confidential')}
        </StatusBadge>
      ) : null}
    </span>
  );
}
