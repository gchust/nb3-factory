/**
 * The client side of the after-sales service domain.
 *
 * Every request goes through the application's `ApiClient`, so the base path,
 * the session cookie and the `Accept-Language` header are the application's and
 * never a second fetch of our own. A failure carries the server's own message
 * because the domain answers errors as `{ error: { code, message } }`.
 */
import { useMemo } from 'react';
import {
  ApiClientError,
  useApiClient,
  useToaster,
  type ApiRequestOptions,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

export interface ServiceList<T> {
  readonly rows: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type ServiceQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ServiceApi {
  get<T>(path: string, query?: ServiceQuery): Promise<T>;
  post<T>(path: string, json?: unknown): Promise<T>;
  patch<T>(path: string, json?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  /** Show a failed request as a toast, using the server's own message. */
  report(error: unknown): void;
}

export function useServiceApi(): ServiceApi {
  const client = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  return useMemo<ServiceApi>(() => {
    const request = async <T>(options: ApiRequestOptions): Promise<T> => {
      const response = await client.request<{ data: T }>(options);
      return response.data;
    };
    return {
      get: <T>(path: string, query?: ServiceQuery) =>
        request<T>({
          method: 'GET',
          path: `/service${path}`,
          ...(query ? { query } : {}),
        }),
      post: <T>(path: string, json?: unknown) =>
        request<T>({
          method: 'POST',
          path: `/service${path}`,
          json: json ?? {},
        }),
      patch: <T>(path: string, json?: unknown) =>
        request<T>({
          method: 'PATCH',
          path: `/service${path}`,
          json: json ?? {},
        }),
      del: <T>(path: string) =>
        request<T>({ method: 'DELETE', path: `/service${path}` }),
      report: (error: unknown) => {
        toaster.show({
          type: 'error',
          title: t('service.common.actionFailed'),
          description:
            error instanceof ApiClientError ? error.message : String(error),
        });
      },
    };
  }, [client, toaster, t]);
}
