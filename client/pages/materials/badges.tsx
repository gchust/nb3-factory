import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import type { MaterialListItem } from './types.js';

function Badge({
  children,
  tone = 'muted',
}: {
  readonly children: React.ReactNode;
  readonly tone?: 'muted' | 'primary' | 'danger';
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/** The publication, confidentiality and temporary-share state of a document. */
export function MaterialBadges({
  material,
}: {
  readonly material: MaterialListItem;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-1'>
      <Badge tone={material.published ? 'primary' : 'muted'}>
        {material.published
          ? t('materials.status.published')
          : t('materials.status.draft')}
      </Badge>
      <Badge tone={material.confidential ? 'danger' : 'muted'}>
        {material.confidential
          ? t('materials.field.confidential')
          : t('materials.status.open')}
      </Badge>
      {material.shared ? (
        <Badge tone='primary'>{t('materials.sharedBadge')}</Badge>
      ) : null}
    </div>
  );
}
