'use client';

import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import type { Todo } from './types.js';

export interface ToggleCompletedButtonProps {
  readonly todo: Todo;
  /** The saved todo, or `undefined` when it no longer exists. */
  readonly onToggled: (todo: Todo | undefined) => void;
}

/**
 * The list's only row action: marks a todo done, or reopens it. One non-destructive action on a row, so it is a
 * single button rather than a "…" menu.
 */
export function ToggleCompletedButton({
  todo,
  onToggled,
}: ToggleCompletedButtonProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);

  async function toggle(): Promise<void> {
    setPending(true);
    try {
      const { data } = await api.request<
        { data: Todo },
        { completed: boolean }
      >({
        path: `todos/${encodeURIComponent(todo.id)}`,
        method: 'PATCH',
        json: { completed: !todo.completed },
      });
      toaster.show({
        type: 'success',
        title: data.completed
          ? t('todos.complete.success', { title: data.title })
          : t('todos.reopen.success', { title: data.title }),
      });
      onToggled(data);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        // The todo is gone: say so, and refresh the list so its row disappears (guideline R3).
        toaster.show({ type: 'info', title: t('todos.error.notFound') });
        onToggled(undefined);
      } else {
        toaster.show({
          type: 'error',
          title:
            error instanceof ApiClientError && error.status === 403
              ? t('todos.error.forbidden')
              : t('todos.error.requestFailed'),
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      disabled={pending}
      onClick={() => void toggle()}
    >
      {pending ? <Spinner data-icon='inline-start' /> : null}
      {todo.completed ? t('todos.actions.reopen') : t('todos.actions.complete')}
    </Button>
  );
}
