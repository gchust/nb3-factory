import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
  deliveryErrorMessage,
  shouldRetryDeliveryRequest,
} from './delivery.js';

export interface DeliveryQuery<T> {
  readonly loading: boolean;
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly reload: () => void;
  readonly setData: (data: T) => void;
}

/**
 * Data hook for the delivery pages. `key` names the resource and `deps` become
 * part of the query key, so two loaders never share a cache entry and changing
 * a route id refetches.
 */
export function useDeliveryQuery<T>(
  key: string,
  loader: (api: ApiClient) => Promise<T>,
  deps: readonly unknown[] = [],
): DeliveryQuery<T> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const queryKey = ['delivery', key, ...deps];
  const query = useQuery({
    queryKey,
    queryFn: () => loader(api),
    retry: shouldRetryDeliveryRequest,
  });

  return {
    loading: query.isPending,
    data: query.data,
    error: query.error ? deliveryErrorMessage(query.error) : undefined,
    reload: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    setData: (data: T) => {
      queryClient.setQueryData(queryKey, data);
    },
  };
}

export interface DeliveryAction {
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly run: (
    action: (api: ApiClient) => Promise<unknown>,
  ) => Promise<boolean>;
  readonly clearError: () => void;
}

/** Runs one mutation and keeps a translated failure message for the page. */
export function useDeliveryAction(): DeliveryAction {
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const run = useCallback(
    async (
      action: (client: ApiClient) => Promise<unknown>,
    ): Promise<boolean> => {
      setPending(true);
      setError(undefined);
      try {
        await action(api);
        return true;
      } catch (cause) {
        setError(deliveryErrorMessage(cause));
        return false;
      } finally {
        setPending(false);
      }
    },
    [api],
  );

  const clearError = useCallback(() => setError(undefined), []);

  return { pending, error, run, clearError };
}
