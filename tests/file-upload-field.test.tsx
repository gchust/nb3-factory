import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui/components/file-upload-field';
import type {
  FileRecord,
  FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui/types';
import type { ClientFileRepository } from '@nocobase/app-plugin-file/client';

function makeRecord(file: File): FileRecord {
  return {
    id: `id-${file.name}`,
    disk: 'local',
    key: `objects/${file.name}`,
    filename: file.name,
    ext: 'png',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    contentUrl: `/uploads/product-images/${file.name}`,
  };
}

function Harness({
  repository,
  onChange,
}: {
  readonly repository: ClientFileRepository;
  readonly onChange: (value: readonly FileRecord[]) => void;
}): ReactElement {
  const [value, setValue] = useState<readonly FileRecord[]>([]);
  return (
    <FileUploadField
      repository={repository}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      multiple
      labels={{ choose: 'Choose files' }}
    />
  );
}

function makeRepository(): {
  repository: ClientFileRepository;
  uploadOne: ReturnType<typeof vi.fn>;
} {
  const uploadOne = vi.fn(async ({ file }: { file: File }) => ({
    record: makeRecord(file),
    createdTargets: [],
  }));
  return {
    repository: { uploadOne } as unknown as ClientFileRepository,
    uploadOne,
  };
}

describe('FileUploadField multi-file selection', () => {
  it('commits every file selected in one batch', async () => {
    const { repository, uploadOne } = makeRepository();
    const onChange = vi.fn();
    render(<Harness repository={repository} onChange={onChange} />);

    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ];
    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files },
    });

    await waitFor(() => expect(uploadOne).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const last = onChange.mock.calls.at(-1)?.[0] as readonly FileRecord[];
    expect(last.map((record) => record.filename)).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ]);
  });

  it('reports upload status so a form can block submission', async () => {
    const { repository } = makeRepository();
    const statuses: FileUploadStatus[] = [];
    render(
      <FileUploadField
        repository={repository}
        value={[]}
        onChange={() => undefined}
        onStatusChange={(status) => statuses.push(status)}
        multiple
        labels={{ choose: 'Choose files' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(statuses).toContain('uploading'));
    await waitFor(() => expect(statuses.at(-1)).toBe('idle'));
  });
});
