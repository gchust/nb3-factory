import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';

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
import { toast } from '@/components/ui/toast';

import { returnLoan } from './api.js';
import type { LoanRecord } from './types.js';

export interface ReturnDialogProps {
  /** The open borrow record to return; `null` keeps the dialog closed. */
  readonly loanId: number | null;
  readonly equipmentLabel: string;
  readonly borrower: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReturned: (loan: LoanRecord) => void;
  /** The record no longer exists (404): refresh the list and close. */
  readonly onGone: () => void;
}

/**
 * Confirmation before returning a device. The server confirms the return time
 * once, so a repeated click never changes it or adds a second record.
 */
export function ReturnDialog({
  loanId,
  equipmentLabel,
  borrower,
  onOpenChange,
  onReturned,
  onGone,
}: ReturnDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (loanId === null) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const loan = await returnLoan(api, loanId);
      toast.add({
        type: 'success',
        title: t('equipment.return.success', { name: equipmentLabel }),
      });
      onReturned(loan);
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiClientError ? caught : undefined;
      if (apiError?.status === 404) {
        // The record is already gone; treat it as done and refresh the list.
        toast.add({ type: 'info', title: t('equipment.error.notFound') });
        onGone();
      } else if (apiError?.status === 403) {
        setError(t('equipment.error.forbidden'));
      } else {
        setError(t('equipment.error.requestFailed'));
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={loanId !== null}
      onOpenChange={(next) => {
        if (pendingRef.current) return;
        // Clearing on close means the next record starts with no stale error.
        if (!next) {
          setPending(false);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('equipment.return.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('equipment.return.description', {
              name: equipmentLabel,
              borrower,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => {
              void confirm();
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {pending ? t('actions.saving') : t('equipment.return.action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
