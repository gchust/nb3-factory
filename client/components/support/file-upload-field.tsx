import { useRef, type ReactElement } from 'react';
import { Paperclip, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/support';

export interface FileUploadFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: readonly File[];
  readonly onChange: (files: readonly File[]) => void;
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
}

/**
 * A controlled local-file picker. Files are chosen from disk only — there is
 * deliberately no way to paste a URL — and the selection is handed to the
 * caller, which uploads it separately.
 */
export function FileUploadField({
  id,
  label,
  value,
  onChange,
  accept,
  multiple = false,
  disabled = false,
}: FileUploadFieldProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelection = (list: FileList | null): void => {
    const selected = Array.from(list ?? []);
    onChange(multiple ? [...value, ...selected] : selected.slice(0, 1));
    // Reset so picking the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className='space-y-2'>
      <input
        ref={inputRef}
        id={id}
        name='file'
        type='file'
        className='hidden'
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => handleSelection(event.target.files)}
      />
      <Button
        type='button'
        variant='outline'
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden='true' />
        {label}
      </Button>
      {value.length > 0 ? (
        <ul className='space-y-1'>
          {value.map((file) => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <span className='truncate'>{file.name}</span>
              <span className='shrink-0'>{formatFileSize(file.size)}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(value.filter((item) => item !== file))}
              >
                <X aria-hidden='true' />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
