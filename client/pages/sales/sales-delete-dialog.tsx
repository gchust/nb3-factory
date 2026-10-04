import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
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
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

import {
  notifySalesDataChanged,
  salesErrorMessageKey,
  type NamedRecord,
  type SalesResource,
} from './shared';

export interface SalesDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly resource: SalesResource;
  /** The record to delete. The caller keeps it while the dialog closes, so the title does not blank out mid-animation. */
  readonly record: NamedRecord | null;
  /** Called when the record is gone — deleted now, or already deleted by someone else. */
  readonly onDeleted: () => void;
}

/** The one delete confirmation shared by the customer, contact and opportunity lists and detail views. */
export function SalesDeleteDialog({
  open,
  onOpenChange,
  resource,
  record,
  onDeleted,
}: SalesDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();

  async function confirmDelete(target: NamedRecord): Promise<void> {
    setPending(true);
    setErrorKey(undefined);
    try {
      await api.request({
        path: `sales/${resource}/${target.id}`,
        method: 'DELETE',
      });
      toaster.show({
        type: 'success',
        title: t('sales.delete.success', { name: target.name }),
      });
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        // Someone else already deleted it; what the user wanted has happened.
        toaster.show({
          type: 'info',
          title: t('sales.delete.notFound', { name: target.name }),
        });
      } else {
        // Keep the dialog open and explain the failure in place, without the backend's raw message.
        setErrorKey(salesErrorMessageKey(caught));
        setPending(false);
        return;
      }
    }
    setPending(false);
    notifySalesDataChanged();
    onDeleted();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) {
          return;
        }
        if (!next) {
          setErrorKey(undefined);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('sales.delete.title', { name: record?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('sales.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorKey ? (
          <p className='text-sm text-destructive' role='alert'>
            {t(errorKey)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          {/* AlertDialogAction does not close the dialog itself: onDeleted has the caller close it. */}
          <AlertDialogAction
            variant='destructive'
            disabled={pending}
            onClick={() => {
              if (record) {
                void confirmDelete(record);
              }
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('sales.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
