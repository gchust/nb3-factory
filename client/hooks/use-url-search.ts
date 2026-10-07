import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export interface UseUrlSearchOptions {
  /** The query parameter the term is stored in. Defaults to `q`. */
  readonly key?: string;
  /** How long typing pauses before the URL is updated, in milliseconds. */
  readonly delay?: number;
}

export interface UseUrlSearchResult {
  /** Every parameter of the current URL, including this one. */
  readonly searchParams: URLSearchParams;
  /** The term as committed to the URL — what a request should use. */
  readonly search: string;
  /** The text in the input, which may be one keystroke ahead of `search`. */
  readonly text: string;
  readonly inputProps: {
    readonly value: string;
    readonly onChange: (event: { target: { value: string } }) => void;
  };
  /** Replace the whole query string, keeping the history entry, so back and forward are not one entry per keystroke. */
  readonly updateParams: (
    mutate: (params: URLSearchParams) => void,
    options?: { replace?: boolean },
  ) => void;
  /** Clear this term and any other filters the caller names, then focus the input through the returned callback. */
  readonly clear: (mutate?: (params: URLSearchParams) => void) => void;
}

/**
 * A search box whose term lives in the URL.
 *
 * The URL is the source of truth: typing writes to it (after a short pause) and the input follows it. Back, forward
 * and a shared link all land on the same filtered view, and a child page's "back" keeps the filters, because they
 * are part of the URL the list is on.
 *
 * `text` and `search` are deliberately separate. `text` is what the user is typing and updates on every keystroke;
 * `search` is what has been committed, and only it should drive a request. Committing on a length change would
 * refetch on every keypress.
 */
export function useUrlSearch({
  key = 'q',
  delay = 300,
}: UseUrlSearchOptions = {}): UseUrlSearchResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get(key) ?? '';
  const [text, setText] = useState(search);
  // Adjust the input when the URL changes from elsewhere — back, forward, or "Clear filters" — without an effect,
  // the pattern React recommends for state derived from a changing prop.
  const [lastSearch, setLastSearch] = useState(search);
  if (lastSearch !== search) {
    setLastSearch(search);
    setText(search);
  }

  const updateParams = useCallback(
    (
      mutate: (params: URLSearchParams) => void,
      options?: { replace?: boolean },
    ) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          mutate(next);
          return next;
        },
        { replace: options?.replace ?? true },
      );
    },
    [setSearchParams],
  );

  // Commit the typed term once typing pauses. Replace, not push: one history entry per keystroke would make the
  // browser's Back walk the term backwards letter by letter.
  const normalized = text.trim();
  useEffect(() => {
    if (normalized === search) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      updateParams((params) => {
        if (normalized) {
          params.set(key, normalized);
        } else {
          params.delete(key);
        }
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, key, normalized, search, updateParams]);

  const clear = useCallback(
    (mutate?: (params: URLSearchParams) => void) => {
      setText('');
      updateParams((params) => {
        params.delete(key);
        mutate?.(params);
      });
    },
    [key, updateParams],
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
