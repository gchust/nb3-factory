import { useCallback, useMemo, useState } from 'react';

import type { ServiceQuery } from './api.js';

/** Filter and page state for one server-paged list, shared by every list page. */
export interface PagedList {
  readonly page: number;
  readonly pageSize: number;
  readonly filters: Readonly<Record<string, string>>;
  readonly query: ServiceQuery;
  /** A stable identity for the current query, usable as a request key. */
  readonly key: string;
  setPage(page: number): void;
  setFilter(key: string, value: string | undefined): void;
  setFilters(values: Readonly<Record<string, string>>): void;
  reset(): void;
}

/**
 * Holds the page, the page size and a flat filter map, and derives the query
 * the API receives. Changing any filter returns to the first page, because the
 * old page number is meaningless against a different result set.
 */
export function usePagedList(
  pageSize = 20,
  initialFilters: Readonly<Record<string, string>> = {},
): PagedList {
  const [page, setPage] = useState(1);
  const [filtersState, setFiltersState] = useState<Record<string, string>>({
    ...initialFilters,
  });

  const setFilter = useCallback((key: string, value: string | undefined) => {
    setFiltersState((previous) => {
      const next = { ...previous };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  }, []);

  const setFilters = useCallback((values: Readonly<Record<string, string>>) => {
    setFiltersState({ ...values });
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFiltersState({});
    setPage(1);
  }, []);

  const query = useMemo<ServiceQuery>(
    () => ({ page, pageSize, ...filtersState }),
    [page, pageSize, filtersState],
  );
  const key = useMemo(() => JSON.stringify(query), [query]);

  return {
    page,
    pageSize,
    filters: filtersState,
    query,
    key,
    setPage,
    setFilter,
    setFilters,
    reset,
  };
}
