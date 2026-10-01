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

import type { Todo } from './types.js';

export interface TodoDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The record to delete. The parent keeps it after closing, so the title does not go blank during the exit animation. */
  readonly todo: Pick<Todo, 'id' | 'title'> | null | undefined;
  /** Called when the delete succeeds or the record was already gone (404). The parent closes the dialog and refreshes the list. */
  readonly onDeleted: () => void;
  /** Where focus goes after the delete, because the row menu that opened this dialog disappears with the row. */
  readonly deletedFocusRef?: RefObject<HTMLElement | null>;
}

/** The delete confirmation for a single todo, shared by the row menu and anywhere else a delete is offered. */
export function TodoDeleteDialog({
  open,
  onOpenChange,
  todo,
  onDeleted,
  deletedFocusRef,
}: TodoDeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'forbidden' | 'requestFailed'>();
  const deletedRef = useRef(false);

  async function confirmDelete(
    target: Pick<Todo, 'id' | 'title'>,
  ): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await api.request({ path: `todos/${target.id}`, method: 'DELETE' });
      toaster.show({
        type: 'success',
        title: t('todos.delete.success', { title: target.title }),
      });
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      if (status !== 404) {
        // Other failures: keep the dialog open and explain the reason inside it, without showing the backend's raw message.
        setError(status === 403 ? 'forbidden' : 'requestFailed');
        setPending(false);
        return;
      }
      // 404: someone else already deleted the record. What the user wanted already happened.
      toaster.show({
        type: 'info',
        title: t('todos.delete.notFound', { title: target.title }),
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
        // No closing while the delete is in progress: Esc, the backdrop and the cancel button all end up here.
        if (!next && pending) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = deletedRef.current ? deletedFocusRef?.current : null;
          deletedRef.current = false;
          // true keeps the default: focus returns to the element that had it before the dialog opened.
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('todos.delete.title', { title: todo?.title ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('todos.delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error === 'forbidden'
              ? t('todos.error.forbidden')
              : t('todos.error.requestFailed')}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          {/* AlertDialogAction does not close the dialog automatically: on success, onDeleted has the parent close it. */}
          <AlertDialogAction
            variant='destructive'
            disabled={pending || error === 'forbidden'}
            onClick={() => {
              if (todo) void confirmDelete(todo);
            }}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('todos.delete.action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
