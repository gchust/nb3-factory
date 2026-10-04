import {
  ApiClientError,
  useApiClient,
  type ApiRequestOptions,
} from '@nocobase/app-client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSearchParams } from 'react-router';

/**
 * Types, constants and small utilities shared by the sales pages.
 *
 * This module is deliberately free of components so Fast Refresh keeps working for the pages that import it.
 */

export const OPPORTUNITY_STAGES = ['following_up', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The customer detail payload: the record plus its contacts, opportunities and estimated-amount total. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  readonly opportunityAmountTotal: number;
}

/** A record that can be deleted, which is all the delete confirmation needs. */
export interface NamedRecord {
  readonly id: number;
  readonly name: string;
}

export type SalesResource = 'customers' | 'contacts' | 'opportunities';

/**
 * A module-level revision counter every sales page subscribes to. A page calls `notifySalesDataChanged()` after a
 * mutation, and every list, detail view and form that reads `useSalesRevision()` re-runs its request, so a save in a
 * dialog refreshes the page behind it without threading a `reload` callback through every outlet.
 */
let salesRevision = 0;
const salesListeners = new Set<() => void>();

export function notifySalesDataChanged(): void {
  salesRevision += 1;
  for (const listener of salesListeners) {
    listener();
  }
}

function subscribeSalesData(listener: () => void): () => void {
  salesListeners.add(listener);
  return () => {
    salesListeners.delete(listener);
  };
}

function readSalesRevision(): number {
  return salesRevision;
}

export function useSalesRevision(): number {
  return useSyncExternalStore(
    subscribeSalesData,
    readSalesRevision,
    readSalesRevision,
  );
}

export interface ApiQueryState<T> {
  /** The parsed `data` of the response, or `undefined` before the first result and when the request is disabled. */
  readonly data: T | undefined;
  /** The failure of the current request, `undefined` while it is in flight or after it succeeds. */
  readonly error: unknown;
  readonly loading: boolean;
  /** Re-runs the same request in the background; the current data stays visible while it is in flight. */
  readonly reload: () => void;
}

/**
 * Runs a GET request and keeps its result.
 *
 * `request` must be referentially stable — build it with `useMemo`. Pass `null` to disable the request.
 */
export function useApiQuery<T>(
  request: ApiRequestOptions | null,
): ApiQueryState<T> {
  const api = useApiClient();
  // Every query re-runs after any sales mutation, so a save in a dialog refreshes every list and detail view around it.
  // The revision goes into the request token, not the request key: the data already on screen stays until the refresh
  // lands, instead of blanking for one round trip.
  const revision = useSalesRevision();
  const requestKey = useMemo(() => serializeRequest(request), [request]);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly requestKey: string;
    readonly token: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();

  const token = `${revision}:${reloadCount}`;

  useEffect(() => {
    if (!request) {
      return;
    }
    const controller = new AbortController();
    const resultToken = token;
    api.request<{ data: T }>({ ...request, signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, token: resultToken, data: response.data });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, token: resultToken, error });
        }
      },
    );
    return () => controller.abort();
  }, [api, request, requestKey, token]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  if (!request) {
    return { data: undefined, error: undefined, loading: false, reload };
  }

  return {
    data: result?.requestKey === requestKey ? result.data : undefined,
    error: result?.token === token ? result.error : undefined,
    loading: result?.token !== token,
    reload,
  };
}

function serializeRequest(request: ApiRequestOptions | null): string {
  if (!request) {
    return 'disabled';
  }
  return JSON.stringify([
    request.method ?? 'GET',
    request.path,
    request.query ?? null,
    request.json ?? null,
  ]);
}

/**
 * The current value of a URL query parameter, with a setter that writes it back with `replace` so the browser history
 * is not filled with filter changes. An empty value removes the parameter.
 */
export function useUrlSearch(key: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? '';
  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (next === '') {
            updated.delete(key);
          } else {
            updated.set(key, next);
          }
          return updated;
        },
        { replace: true },
      );
    },
    [key, setSearchParams],
  );
  return [value, setValue];
}

/** The customer dropdown options shared by the filters and the contact/opportunity forms. */
export interface CustomerOption {
  readonly value: string;
  readonly label: string;
}

export function useCustomerOptions(): {
  readonly customers: readonly Customer[];
  readonly options: readonly CustomerOption[];
  readonly loading: boolean;
} {
  const request = useMemo(() => ({ path: 'sales/customers' }), []);
  const { data, loading } = useApiQuery<Customer[]>(request);
  const customers = useMemo(() => data ?? [], [data]);
  const options = useMemo(
    () =>
      customers.map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers],
  );
  return { customers, options, loading };
}

/** Client translation key for a server business error `code`, or `undefined` when the code is unknown. */
const SALES_ERROR_KEYS: Readonly<Record<string, string>> = {
  CUSTOMER_NAME_REQUIRED: 'sales.errors.customerNameRequired',
  CONTACT_NAME_REQUIRED: 'sales.errors.contactNameRequired',
  CONTACT_CUSTOMER_REQUIRED: 'sales.errors.contactCustomerRequired',
  OPPORTUNITY_NAME_REQUIRED: 'sales.errors.opportunityNameRequired',
  OPPORTUNITY_CUSTOMER_REQUIRED: 'sales.errors.opportunityCustomerRequired',
  CUSTOMER_NOT_FOUND: 'sales.errors.customerNotFound',
  CONTACT_NOT_FOUND: 'sales.errors.contactNotFound',
  OPPORTUNITY_NOT_FOUND: 'sales.errors.opportunityNotFound',
  CUSTOMER_HAS_RELATED_RECORDS: 'sales.errors.customerHasRelatedRecords',
  INVALID_AMOUNT: 'sales.errors.invalidAmount',
  INVALID_STAGE: 'sales.errors.invalidStage',
  INVALID_ID: 'sales.errors.requestFailed',
};

export function salesErrorKey(error: unknown): string | undefined {
  if (error instanceof ApiClientError && error.code) {
    return SALES_ERROR_KEYS[error.code];
  }
  return undefined;
}

/** The message to show for a failed write: a mapped business error, permission, or the generic failure. */
export function salesErrorMessageKey(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 403) {
    return 'sales.errors.forbidden';
  }
  return salesErrorKey(error) ?? 'sales.errors.requestFailed';
}

export function formatAmount(locale: string, amount: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function sumAmounts(opportunities: readonly Opportunity[]): number {
  const total = opportunities.reduce(
    (sum, opportunity) => sum + opportunity.amount,
    0,
  );
  return Math.round(total * 100) / 100;
}

export const SALES_STAGE_BADGE: Readonly<
  Record<OpportunityStage, 'default' | 'secondary' | 'destructive'>
> = {
  following_up: 'secondary',
  won: 'default',
  lost: 'destructive',
};
