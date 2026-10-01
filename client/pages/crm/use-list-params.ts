import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

const SEARCH_PARAM = 'q';
const SEARCH_DELAY = 300;

export interface ListParams {
  /** The trimmed search term the request uses; the raw URL value keeps spaces. */
  readonly search: string;
  /** The search box's current text. */
  readonly text: string;
  /** Whether the box holds a term, used to decide if "Clear filters" shows. */
  readonly hasSearchText: boolean;
  /** Updates the text and, unless an input method is composing, schedules the URL write. */
  readonly onSearchInput: (value: string, composing: boolean) => void;
  /** Call on `compositionend`, so a confirmed candidate is the term that searches. */
  readonly onSearchCommit: (value: string) => void;
  /** Sets or removes one filter parameter in the URL; `null` removes it. */
  readonly setParam: (name: string, value: string | null) => void;
  /** Clears the search box and cancels a pending write. */
  readonly clearSearch: () => void;
}

/**
 * Keeps a CRM list's search term in the URL as `?q=`, written 300ms after
 * typing stops, without binding the input to the URL between keystrokes.
 *
 * This mirrors the list-page pattern the application's table reference
 * documents. It lives in the CRM feature folder because all three list pages
 * need the same behaviour; the individual pages still own their columns,
 * filters and requests.
 */
export function useListParams(): ListParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get(SEARCH_PARAM) ?? '';

  // The latest parameters this page wrote or the router updated. The function
  // form of setSearchParams sees only the render that issued it, so two writes
  // close together would overwrite each other; every write starts from here.
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);

  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  const [text, setText] = useState(urlSearch);
  // What this page last wrote, and what the previous render saw.
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    // Compare with the previous value during render instead of in an effect.
    setSeenSearch(urlSearch);
    // A value this page wrote itself arrives after later keystrokes (it equals
    // ownSearch) and must not overwrite the input.
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }

  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    const addressSearch = (): string =>
      new URLSearchParams(window.location.search).get(SEARCH_PARAM) ?? '';
    const startSearch = paramsRef.current.get(SEARCH_PARAM) ?? '';
    const startAddress = addressSearch();
    searchTimerRef.current = window.setTimeout(() => {
      // If navigation changed the parameters while the timer ran, that result
      // wins. The address bar changes immediately; the router parameters update
      // only after the transition commits, so check both.
      if (
        (paramsRef.current.get(SEARCH_PARAM) ?? '') !== startSearch ||
        addressSearch() !== startAddress
      ) {
        return;
      }
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set(SEARCH_PARAM, value);
        else params.delete(SEARCH_PARAM);
      });
    }, SEARCH_DELAY);
  }

  function clearSearch(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => params.delete(SEARCH_PARAM));
  }

  return {
    search: urlSearch.trim(),
    text,
    hasSearchText: text.trim() !== '',
    onSearchInput: (value, composing) => {
      setText(value);
      if (!composing) scheduleSearch(value);
    },
    onSearchCommit: scheduleSearch,
    setParam: (name, value) => {
      updateParams((params) => {
        if (value) params.set(name, value);
        else params.delete(name);
      });
    },
    clearSearch,
  };
}
