import { useTranslation } from '@nocobase/i18n/client';
import type { Table as TableInstance } from '@tanstack/react-table';
import { SearchIcon, XIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { DataTableViewOptions } from '@/components/data-table-view-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The toolbar a service table renders above its rows: one column's text filter
 * on the left, the column visibility menu on the right. Filtering happens in
 * the browser on rows the endpoint already returned, so typing never issues a
 * request.
 */
export function ServiceTableToolbar<TData>({
  table,
  columnId,
  placeholder,
  children,
}: {
  readonly table: TableInstance<TData>;
  readonly columnId: string;
  readonly placeholder?: string;
  readonly children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const column = table.getColumn(columnId);
  const value = (column?.getFilterValue() as string | undefined) ?? '';
  return (
    <div className='flex w-full flex-wrap items-center gap-2'>
      <div className='relative w-full max-w-xs'>
        <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          value={value}
          placeholder={placeholder ?? t('service.action.search')}
          className='pl-8'
          onChange={(event) => column?.setFilterValue(event.target.value)}
        />
        {value.length > 0 ? (
          <Button
            variant='ghost'
            size='icon-xs'
            className='absolute top-1/2 right-1 -translate-y-1/2'
            onClick={() => column?.setFilterValue('')}
          >
            <XIcon />
            <span className='sr-only'>{t('service.action.clearSearch')}</span>
          </Button>
        ) : null}
      </div>
      {children}
      <div className='ml-auto'>
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
