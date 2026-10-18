import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useSearchParams } from 'react-router';

/** The query parameter a list page keeps its free-text search in. */
const SEARCH_PARAM = 'q';
/** How long typing settles before the URL, and so the request, catches up. */
const SEARCH_DELAY_MS = 300;

export interface UrlSearchInputProps {
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export interface UrlSearch {
  /** The current parameters, for reading filters other than the search term. */
  readonly searchParams: URLSearchParams;
  /** The committed search term, as the loaded result was requested with it. */
  readonly search: string;
  /** The search box's live text, which may not have reached the URL yet. */
  readonly text: string;
  readonly inputProps: UrlSearchInputProps;
  /** Update any parameter, the way a page changes its filters or page number. */
  readonly updateParams: (update: (params: URLSearchParams) => void) => void;
  /** Drop the search term and the page number, for "Clear filters". */
  readonly clear: (update?: (params: URLSearchParams) => void) => void;
}

/**
 * A search box backed by the URL: typing is debounced into the query string, so a refresh, a bookmarked link and the
 * browser's back and forward buttons all restore the same list. The box keeps its own text while the request catches
 * up, so a slow response never interrupts typing.
 */
export function useUrlSearch(): UrlSearch {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get(SEARCH_PARAM) ?? '';
  const [text, setText] = useState(search);
  // What the box last agreed with: the URL, or the value the box just committed. It tells an outside change (back,
  // forward, "Clear filters") apart from the box's own text, so the two never overwrite each other.
  const committedRef = useRef(search);

  useEffect(() => {
    if (search === committedRef.current) {
      return;
    }
    committedRef.current = search;
    setText(search);
  }, [search]);

  useEffect(() => {
    if (text === committedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      committedRef.current = text;
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (text) {
            next.set(SEARCH_PARAM, text);
          } else {
            next.delete(SEARCH_PARAM);
          }
          // A narrower search starts a new first page.
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, setSearchParams]);

  const updateParams = useCallback(
    (update: (params: URLSearchParams) => void): void => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        update(next);
        return next;
      });
    },
    [setSearchParams],
  );

  const clear = useCallback(
    (update?: (params: URLSearchParams) => void): void => {
      setText('');
      committedRef.current = '';
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete(SEARCH_PARAM);
        next.delete('page');
        update?.(next);
        return next;
      });
    },
    [setSearchParams],
  );

  return {
    searchParams,
    search,
    text,
    inputProps: {
      value: text,
      onChange: (event) => setText(event.target.value),
    },
    updateParams,
    clear,
  };
}
