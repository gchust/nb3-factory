import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

/** Whether a material is published or still a draft. */
export function MaterialPublishBadge({
  published,
}: {
  readonly published: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={published ? 'success' : 'neutral'}>
      {published
        ? t('materials.publish.published')
        : t('materials.publish.draft')}
    </StatusBadge>
  );
}

/** Whether a material is confidential. Confidential materials are never shared. */
export function MaterialConfidentialBadge({
  confidential,
}: {
  readonly confidential: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={confidential ? 'warning' : 'neutral'}>
      {confidential
        ? t('materials.confidentiality.confidential')
        : t('materials.confidentiality.public')}
    </StatusBadge>
  );
}
