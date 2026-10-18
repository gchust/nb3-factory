// The DataTable is the application's own table component, built on TanStack Table (see the table reference). These
// tests cover what a page relies on: one row per record, the empty message, and browser-side pagination.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import type { ColumnDef } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '#components/data-table';

import enUS from '../../client/locales/en-US.js';

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

interface Row {
  readonly id: number;
  readonly name: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'id', header: 'Id' },
];

function names(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '');
}

function renderTable(
  data: Row[],
  pageSize?: number,
): ReturnType<typeof render> {
  return render(
    <DataTable<Row>
      columns={columns}
      data={data}
      getRowId={(row) => String(row.id)}
      {...(pageSize === undefined ? {} : { pageSize })}
    />,
    { wrapper: I18n },
  );
}

describe('DataTable', () => {
  it('renders one row per record', () => {
    renderTable([
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ]);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    renderTable([]);

    expect(screen.getByText(enUS.dataTable.noResults)).toBeInTheDocument();
  });

  it('paginates in the browser and moves between pages', async () => {
    const user = userEvent.setup();
    const data = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      name: `Row ${index + 1}`,
    }));
    renderTable(data, 10);

    // The first page holds ten rows.
    expect(names()).toHaveLength(10);
    expect(
      screen.getByText(
        enUS.dataTable.pageOf
          .replace('{{page}}', '1')
          .replace('{{pageCount}}', '2'),
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: enUS.dataTable.nextPage }),
    );

    // The second page holds the remaining two.
    expect(names()).toHaveLength(2);
    expect(screen.getByText(/Row 11/)).toBeInTheDocument();
  });
});
