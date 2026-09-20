import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseRevisionView } from '../../client/pages/expenses/api.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useService: () => ({
      repository: () => ({
        uploadOne: vi.fn(),
        uploadMany: vi.fn(),
        deleteOne: vi.fn(),
      }),
    }),
  };
});

const { ExpenseRevisionHistory } =
  await import('../../client/pages/expenses/revision-history');

function fileView(id: string, filename: string, ext: string) {
  return {
    id,
    filename,
    ext,
    mimeType: ext === 'pdf' ? 'application/pdf' : 'image/png',
    size: 1024,
    createdAt: '2026-08-02T00:00:00.000Z',
    contentUrl: `/main/expense-files/${id}.${ext}`,
  };
}

const revisions: ExpenseRevisionView[] = [
  {
    id: 'rev-1',
    revision: 1,
    status: 'rejected',
    decision: 'rejected',
    comment: '票据不清晰',
    decidedBy: 'u-mgr1',
    decidedByName: '王强',
    submittedAt: '2026-08-02T00:00:00.000Z',
    decidedAt: '2026-08-03T00:00:00.000Z',
    items: [
      {
        id: 'ri-1',
        itemId: 'item-1',
        categoryId: 'c1',
        categoryName: '差旅费',
        expenseDate: '2026-08-01',
        amount: 800,
        description: '往返高铁',
        files: [fileView('file-old', 'first-receipt.png', 'png')],
      },
    ],
    files: [],
    fileCount: 1,
  },
  {
    id: 'rev-2',
    revision: 2,
    status: 'submitted',
    decision: null,
    comment: null,
    decidedBy: null,
    decidedByName: null,
    submittedAt: '2026-08-04T00:00:00.000Z',
    decidedAt: null,
    items: [
      {
        id: 'ri-2',
        itemId: 'item-1',
        categoryId: 'c1',
        categoryName: '差旅费',
        expenseDate: '2026-08-01',
        amount: 800,
        description: '往返高铁',
        files: [fileView('file-new', 'second-receipt.png', 'png')],
      },
    ],
    files: [],
    fileCount: 1,
  },
];

describe('expense revision history', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows each submission with the receipts and decision frozen at that time', () => {
    const { container } = render(
      <ExpenseRevisionHistory revisions={revisions} />,
    );

    const list = container.querySelector('[data-slot="expense-revisions"]');
    expect(list).not.toBeNull();
    // The revision blocks are the ordered list's own children; attachments are
    // nested lists and must not be counted.
    const blocks = Array.from((list as HTMLElement).children) as HTMLElement[];
    expect(blocks).toHaveLength(2);

    // The first submission keeps its own receipt and the return reason.
    expect(within(blocks[0]!).getByText(/first-receipt\.png/)).toBeVisible();
    expect(within(blocks[0]!).queryByText(/second-receipt\.png/)).toBeNull();
    expect(within(blocks[0]!).getByText(/票据不清晰/)).toBeVisible();
    expect(within(blocks[0]!).getByText(/returnedBy/)).toBeVisible();

    // The resubmission shows the new receipt and no decision yet.
    expect(within(blocks[1]!).getByText(/second-receipt\.png/)).toBeVisible();
    expect(within(blocks[1]!).queryByText(/first-receipt\.png/)).toBeNull();
    expect(within(blocks[1]!).queryByText(/returnedBy/)).toBeNull();
  });

  it('renders the frozen history read-only, without upload or remove controls', () => {
    render(<ExpenseRevisionHistory revisions={revisions} />);
    expect(
      screen.queryByRole('button', { name: /expenses\.files\.remove/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /expenses\.files\.add/ }),
    ).toBeNull();
    // Preview and download stay available.
    expect(
      screen.getAllByRole('button', { name: /expenses\.files\.preview/ })
        .length,
    ).toBe(2);
    expect(
      screen.getAllByRole('button', { name: /expenses\.files\.download/ })
        .length,
    ).toBe(2);
  });

  it('renders nothing when the report has never been submitted', () => {
    const { container } = render(<ExpenseRevisionHistory revisions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
