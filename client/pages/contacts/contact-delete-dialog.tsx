import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type RefObject, useRef, useState } from 'react';

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

import type { Contact } from './types.js';

export interface ContactDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly contact: Pick<Contact, 'id' | 'name'> | null | undefined;
  /** Called after the delete succeeds (or the record was already gone). The parent closes the dialog and refreshes the list. */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete, since the menu that opened this dialog disappears with the row. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** Confirms deleting one contact; open state belongs to the list page. */
export function ContactDeleteDialog({
  open,
  onOpenChange,
  contact,
  onDeleted,
  deletedFocusRef,
}: ContactDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'forbidden' | 'requestFailed'>();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<Contact, 'id' | 'name'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await api.request<void>({
        path: `contacts/${target.id}`,
        method: 'DELETE',
      });
      toaster.show({
        type: 'success',
        title: t('contacts.delete.success', { name: target.name }),
      });
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        setError(status === 403 ? 'forbidden' : 'requestFailed');
        setPending(false);
        return;
      }
      // Already deleted by someone else: what the user wanted has happened.
      toaster.show({
        type: 'info',
        title: t('contacts.delete.notFound', { name: target.name }),
      });
    }
    setPending(false);
    deletedRef.current = true;
    onDeleted();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing while the delete is in progress.
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = deletedRef.current ? deletedFocusRef?.current : null;
          deletedRef.current = false;
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('contacts.delete.title', { name: contact?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('contacts.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('contacts.error.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          {/* AlertDialogAction does not close automatically: onDeleted has the parent close it. */}
          <AlertDialogAction
            variant='destructive'
            disabled={pending || error === 'forbidden'}
            onClick={() => {
              if (contact) void confirmDelete(contact);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('contacts.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
