import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CertificateList } from '@/components/employee-records/certificate-list';
import type { Certificate } from '@/components/employee-records/api';

const certificates: Certificate[] = [
  {
    id: 1,
    employeeId: 1,
    name: '特种作业操作证',
    expiresAt: '2027-06-30T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    attachments: [
      {
        id: 'file-1',
        filename: 'permit-a.txt',
        mimeType: 'text/plain',
        size: 12,
        ext: 'txt',
        createdAt: '2026-01-01T00:00:00.000Z',
        contentUrl: '/main/uploads/employee-records/file-1.txt',
      },
    ],
  },
  {
    id: 2,
    employeeId: 1,
    name: '安全生产考核合格证',
    expiresAt: '2026-12-31T00:00:00.000Z',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    attachments: [
      {
        id: 'file-2',
        filename: 'permit-b.txt',
        mimeType: 'text/plain',
        size: 24,
        ext: 'txt',
        createdAt: '2026-01-02T00:00:00.000Z',
        contentUrl: '/main/uploads/employee-records/file-2.txt',
      },
    ],
  },
];

describe('CertificateList', () => {
  it('shows every certificate with its own attachment', () => {
    render(
      <CertificateList
        certificates={certificates}
        deletingId={undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText('特种作业操作证')).toBeInTheDocument();
    expect(screen.getByText('安全生产考核合格证')).toBeInTheDocument();

    const first = screen.getByText('permit-a.txt');
    const second = screen.getByText('permit-b.txt');
    expect(first.closest('a')).toHaveAttribute(
      'href',
      '/main/uploads/employee-records/file-1.txt',
    );
    expect(second.closest('a')).toHaveAttribute(
      'href',
      '/main/uploads/employee-records/file-2.txt',
    );
  });

  it('offers an empty state', () => {
    render(
      <CertificateList
        certificates={[]}
        deletingId={undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByText('certificates.empty')).toBeInTheDocument();
  });

  it('asks the parent to delete the clicked certificate', async () => {
    const onDelete = vi.fn();
    render(
      <CertificateList
        certificates={certificates}
        deletingId={undefined}
        onDelete={onDelete}
      />,
    );

    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[1]!);
    expect(onDelete).toHaveBeenCalledWith(2);
  });
});
