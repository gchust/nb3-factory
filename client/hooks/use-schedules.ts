import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState } from 'react';

import type { Schedule } from '#pages/schedules/types';

/** What a view of the scheduler's plans needs: the rows, their load state, and a way to flip one on or off. */
export interface SchedulesView {
  readonly error?: unknown;
  readonly loading: boolean;
  /** The plan whose enable/disable request is in flight, so its control can be disabled meanwhile. */
  readonly pendingId?: string;
  readonly rows?: Schedule[];
  readonly reload: () => void;
  readonly setEnabled: (schedule: Schedule, enabled: boolean) => Promise<void>;
}

/**
 * Loads the application's scheduling plans from the Scheduler plugin and toggles one's stored enabled state through the
 * plugin's own `/enable` and `/disable` endpoints, so the change lives in the same place the engine reads rather than in
 * the page.
 */
export function useSchedules(): SchedulesView {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly rows?: Schedule[];
    readonly error?: unknown;
  }>();
  const [pendingId, setPendingId] = useState<string>();

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<{ data: Schedule[] }>({
        path: 'scheduler/schedules',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setState({ key, rows: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setState((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const setEnabled = useCallback(
    async (schedule: Schedule, enabled: boolean): Promise<void> => {
      setPendingId(schedule.id);
      try {
        const { data } = await api.request<{ data: Schedule }>({
          method: 'POST',
          path: `scheduler/schedules/${schedule.id}/${enabled ? 'enable' : 'disable'}`,
        });
        setState((previous) =>
          previous?.rows
            ? {
                ...previous,
                rows: previous.rows.map((row) =>
                  row.id === data.id ? data : row,
                ),
              }
            : previous,
        );
        toaster.show({
          type: 'success',
          title: t(
            data.enabled ? 'schedules.enabledToast' : 'schedules.disabledToast',
            { title: data.title },
          ),
        });
      } catch {
        toaster.show({
          type: 'error',
          title: t('schedules.toggleFailed'),
        });
      } finally {
        setPendingId(undefined);
      }
    },
    [api, t, toaster],
  );

  return {
    error: state?.key === requestKey ? state.error : undefined,
    loading: state?.key !== requestKey,
    pendingId,
    reload,
    rows: state?.rows,
    setEnabled,
  };
}
