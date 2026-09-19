import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { bookingErrorCode } from '@/lib/rentals';

/** Localized message for a failed rental request, keyed by its server code. */
export function RentalErrorMessage({
  error,
}: {
  readonly error: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  const code = bookingErrorCode(error);
  return (
    <p className='text-sm text-destructive' role='alert'>
      {t(code ? `rentals.errors.${code}` : 'rentals.errors.generic', {
        defaultValue: t('rentals.errors.generic'),
      })}
    </p>
  );
}
