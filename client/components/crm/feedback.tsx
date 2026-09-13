import { useCallback, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { crmErrorCode } from './api';

/** Turns an API failure into a localized, user-visible message. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook shares the error translation with the components below.
export function useCrmError(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      const code = crmErrorCode(error);
      if (code) {
        const key = `crm.errors.${code}`;
        const translated = t(key, { defaultValue: '' });
        if (translated) return translated;
      }
      return t('crm.errors.generic');
    },
    [t],
  );
}

export function CrmErrorText({
  message,
  className,
}: {
  message?: string;
  className?: string;
}): ReactElement | null {
  if (!message) return null;
  return (
    <p className={cn('text-sm text-destructive', className)} role='alert'>
      {message}
    </p>
  );
}

export function CrmLoading({ label }: { label?: string }): ReactElement {
  return (
    <div className='flex items-center gap-2 p-6 text-sm text-muted-foreground'>
      <Spinner className='size-4' />
      <span>{label}</span>
    </div>
  );
}

export function CrmEmpty({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  );
}
