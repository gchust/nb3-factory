import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import type { AssetStatus, MediaType } from '@/lib/media';

const TYPE_CLASSES: Readonly<Record<MediaType, string>> = {
  image: 'bg-primary/10 text-primary',
  audio: 'bg-accent text-accent-foreground',
  video: 'bg-secondary text-secondary-foreground',
  document: 'bg-muted text-muted-foreground',
};

export function AssetTypeBadge({
  type,
}: {
  readonly type: MediaType;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${TYPE_CLASSES[type]}`}
      data-slot='media-type-badge'
    >
      {t(`media.types.${type}`)}
    </span>
  );
}

export function AssetStatusBadge({
  status,
}: {
  readonly status: AssetStatus;
}): ReactElement {
  const { t } = useTranslation();
  const available = status === 'available';
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
        available
          ? 'bg-primary/10 text-primary'
          : 'bg-destructive/10 text-destructive'
      }`}
      data-slot='media-status-badge'
    >
      {t(available ? 'media.status.available' : 'media.status.disabled')}
    </span>
  );
}
