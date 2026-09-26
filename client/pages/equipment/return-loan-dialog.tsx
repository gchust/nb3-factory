import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

import { returnLoan } from '../equipment-loans/api.js';

export interface ReturnLoanDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The open loan to return; `null` while the dialog is closed. */
  readonly loanId: number | null;
  /** Which device is being returned, shown as the dialog's description. */
  readonly description: string;
  readonly onReturned: () => void;
}

/**
 * Confirms one return. The endpoint keeps the original loan record and only
 * fills in the return time, so returning twice cannot create a second record.
 */
export function ReturnLoanDialog({
  open,
  onOpenChange,
  loanId,
  description,
  onReturned,
}: ReturnLoanDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [pending, setPending] = useState(false);

  async function confirm(): Promise<void> {
    if (loanId === null) {
      return;
    }
    setPending(true);
    try {
      await returnLoan(api, loanId);
      toast.success(t('equipment.return.success'));
      onOpenChange(false);
      onReturned();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.status === 403
          ? t('equipment.error.forbidden')
          : t('equipment.error.requestFailed'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('equipment.return.title')}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void confirm()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('equipment.return.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
