import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlertIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import type { Todo } from './shared.js';

export interface DeleteTodoDialogProps {
  readonly todo: Todo | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDeleted: (id: number) => void;
}

/** Confirms a destructive action, keeps its error inside the dialog and closes only after the server agrees. */
export function DeleteTodoDialog({
  todo,
  onOpenChange,
  onDeleted,
}: DeleteTodoDialogProps): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  if (!todo) {
    return null;
  }

  async function handleDelete(): Promise<void> {
    if (!todo || deleting) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      await api.request({
        method: 'DELETE',
        path: `/todos/${todo.id}`,
      });
      toaster.show({ type: 'success', title: t('todos.toast.deleted') });
      onDeleted(todo.id);
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiClientError && deleteError.status === 404
          ? t('todos.notFound.description')
          : t('todos.delete.failed'),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) {
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('todos.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('todos.delete.description', { title: todo.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <CircleAlertIcon aria-hidden='true' />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <Button
            type='button'
            variant='destructive'
            disabled={deleting}
            onClick={() => {
              void handleDelete();
            }}
          >
            {deleting ? <Spinner className='size-4' /> : null}
            {deleting ? t('todos.delete.deleting') : t('todos.delete.action')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
