import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { returnBorrowRecord } from './api.js';
import type { BorrowRecord } from './types.js';

export interface ReturnLoanActionProps {
  readonly record: BorrowRecord;
  /** Called with the record the endpoint returned, so the list can show the return at once and then refresh. */
  readonly onReturned: (record: BorrowRecord) => void;
}

/**
 * Confirm and record one return. The endpoint is idempotent, so a repeated confirmation cannot create a second
 * record; the button is disabled while the request is in flight.
 */
export function ReturnLoanAction({
  record,
  onReturned,
}: ReturnLoanActionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm(): Promise<void> {
    setPending(true);
    setFailed(false);
    try {
      const saved = await returnBorrowRecord(api, record.id);
      toast.add({
        type: 'success',
        title: t('borrowRecords.return.success', {
          name: record.equipment?.name ?? '',
        }),
      });
      setPending(false);
      setOpen(false);
      onReturned(saved);
      return;
    } catch (error: unknown) {
      // 404 means somebody else already handled it: the equipment is free, so treat it as done.
      if (error instanceof ApiClientError && error.status === 404) {
        toast.add({
          type: 'info',
          title: t('borrowRecords.return.notFound'),
        });
        setPending(false);
        setOpen(false);
        onReturned(record);
        return;
      }
      // Any other failure keeps the confirmation open and explains it, so the user can retry.
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing while the request is in flight.
        if (!next && pending) return;
        if (!next) setFailed(false);
        setOpen(next);
      }}
    >
      <AlertDialogTrigger
        render={<Button variant='outline' size='sm' />}
        aria-label={t('borrowRecords.return.aria', {
          name: record.equipment?.name ?? '',
        })}
      >
        {t('borrowRecords.actions.return')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('borrowRecords.return.title', {
              name: record.equipment?.name ?? '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('borrowRecords.return.description', {
              borrower: record.borrower,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('borrowRecords.return.failed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void confirm()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('borrowRecords.return.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
