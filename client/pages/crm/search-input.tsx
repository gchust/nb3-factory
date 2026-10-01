import { SearchIcon } from 'lucide-react';
import type { ReactElement, RefObject } from 'react';

import { Input } from '@/components/ui/input';

export interface SearchInputProps {
  readonly value: string;
  /**
   * Reports the new text and whether an input method is still composing, so
   * pinyin that is not yet a search term does not start a request.
   */
  readonly onChange: (value: string, composing: boolean) => void;
  /** Reports a confirmed composition candidate. */
  readonly onCompositionEnd?: (value: string) => void;
  readonly placeholder: string;
  readonly label: string;
  /** Lets the page move focus here after a list change, such as a delete. */
  readonly inputRef?: RefObject<HTMLInputElement | null>;
}

/** The search box every CRM list page shares. */
export function SearchInput({
  value,
  onChange,
  onCompositionEnd,
  placeholder,
  label,
  inputRef,
}: SearchInputProps): ReactElement {
  return (
    <div className='relative w-full max-w-xs'>
      <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
            (event.nativeEvent as InputEvent).isComposing,
          )
        }
        onCompositionEnd={(event) =>
          onCompositionEnd?.(event.currentTarget.value)
        }
        placeholder={placeholder}
        aria-label={label}
        className='pl-8'
      />
    </div>
  );
}
