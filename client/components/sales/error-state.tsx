import { useTranslation } from '@nocobase/i18n/client';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export function ErrorState({ message }: { message: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <ShieldAlert className='size-4' />
      <AlertTitle>
        {t('sales.errors.title', { defaultValue: 'Unable to load' })}
      </AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
