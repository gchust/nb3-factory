import {
  type ChangeEvent,
  type CompositionEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';

export interface UrlSearchOptions {
  /** The query parameter that holds the search term. Defaults to `q`. */
  readonly param?: string;
  /** Parameters a new search term removes, such as `page`. */
  readonly resetParams?: readonly string[];
  /** Milliseconds between the last keystroke and the URL write. Defaults to 300. */
  readonly delay?: number;
}

export interface UrlSearch {
  /** The current query parameters, for reading the page's other filters. */
  readonly searchParams: URLSearchParams;
  /** The trimmed search term in the URL: send it to the endpoint. */
  readonly search: string;
  /** What the search box shows, which runs ahead of the URL while the user types. */
  readonly text: string;
  /** Spread onto the search input. */
  readonly inputProps: {
    readonly value: string;
    readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    readonly onCompositionEnd: (
      event: CompositionEvent<HTMLInputElement>,
    ) => void;
  };
  /** Changes parameters on top of the latest ones, replacing the history entry. */
  readonly updateParams: (mutate: (params: URLSearchParams) => void) => void;
  /** Cancels a pending write, empties the box and removes the term; `mutate` removes the page's own filters too. */
  readonly clear: (mutate?: (params: URLSearchParams) => void) => void;
}

/**
 * A search box backed by a URL parameter. The input keeps its own text, so the router's transition never resets it
 * between keystrokes, a Chinese input method's pinyin is not searched, and editing in the middle keeps the caret.
 */
export function useUrlSearch({
  param = 'q',
  resetParams = [],
  delay = 300,
}: UrlSearchOptions = {}): UrlSearch {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get(param) ?? '';

  // The latest parameters: the ones this hook last wrote, or the router last updated.
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
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    setSeenSearch(urlSearch);
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }

  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function schedule(value: string): void {
    window.clearTimeout(timerRef.current);
    const addressSearch = (): string =>
      new URLSearchParams(window.location.search).get(param) ?? '';
    const startSearch = paramsRef.current.get(param) ?? '';
    const startAddress = addressSearch();
    timerRef.current = window.setTimeout(() => {
      if (
        (paramsRef.current.get(param) ?? '') !== startSearch ||
        addressSearch() !== startAddress
      ) {
        return;
      }
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set(param, value);
        else params.delete(param);
        for (const name of resetParams) params.delete(name);
      });
    }, delay);
  }

  function clear(mutate?: (params: URLSearchParams) => void): void {
    window.clearTimeout(timerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete(param);
      for (const name of resetParams) params.delete(name);
      mutate?.(params);
    });
  }

  return {
    searchParams,
    search: urlSearch.trim(),
    text,
    inputProps: {
      value: text,
      onChange: (event) => {
        setText(event.target.value);
        if (!(event.nativeEvent as InputEvent).isComposing) {
          schedule(event.target.value);
        }
      },
      onCompositionEnd: (event) => schedule(event.currentTarget.value),
    },
    updateParams,
    clear,
  };
}

/** `search` without the parameters a view owns, for the way back to the view it covers. */
export function withoutParams(
  search: string,
  names: readonly string[],
): string {
  const params = new URLSearchParams(search);
  for (const name of names) params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
