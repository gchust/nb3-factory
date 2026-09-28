import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { useRouteOverlay } from '@/components/use-route-overlay';

/** A single close button for an overlay footer; renders inside the overlay. */
export function DrawerCloseButton(): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();

  return (
    <Button
      type='button'
      variant='outline'
      onClick={() => void close()}
      disabled={isClosing}
    >
      {t('actions.close')}
    </Button>
  );
}
