import type { ClientFileRepository } from '@nocobase/app-plugin-file/client';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FileRecord } from '@/extensions/nocobase-file-component-ui/types';
import { FileUploadField } from '@/extensions/nocobase-file-component-ui/components/file-upload-field';

function record(id: string, filename: string): FileRecord {
  return {
    id,
    disk: 'local',
    key: `objects/${id}`,
    filename,
    ext: filename.endsWith('.pdf') ? 'pdf' : 'txt',
    mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
    size: 12,
    createdAt: '2026-09-09T00:00:00.000',
    updatedAt: '2026-09-09T00:00:00.000',
  };
}

function makeFile(filename: string): File {
  return new File([filename], filename, {
    type: filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
  });
}

type Deferred = {
  readonly resolve: (result: { readonly record: FileRecord }) => void;
};

/** uploadOne stub whose promises we resolve by hand, one wave at a time. */
function deferredRepository() {
  const deferreds = new Map<string, Deferred>();
  const uploadOne = vi.fn((input: { readonly file: File }) => {
    return new Promise<{ readonly record: FileRecord }>((resolve) => {
      deferreds.set(input.file.name, { resolve });
    });
  });
  const repository = { uploadOne } as unknown as ClientFileRepository;
  return {
    repository,
    deferreds,
    resolve(filename: string, fileRecord: FileRecord): void {
      deferreds.get(filename)?.resolve({ record: fileRecord });
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('FileUploadField multi-file upload', () => {
  it('keeps every file of a single multi-selection batch', async () => {
    const user = userEvent.setup();
    const { repository, deferreds } = deferredRepository();

    function Harness(): ReactElement {
      const [value, setValue] = useState<readonly FileRecord[]>([]);
      return (
        <FileUploadField
          repository={repository}
          value={value}
          onChange={setValue}
          multiple
        />
      );
    }

    render(<Harness />);
    await user.upload(screen.getByLabelText('Choose files'), [
      makeFile('f-1.pdf'),
      makeFile('f-2.pdf'),
      makeFile('f-3.pdf'),
    ]);

    expect(deferreds.size).toBe(3);
    await act(async () => {
      deferreds.get('f-1.pdf')?.resolve({ record: record('1', 'f-1.pdf') });
      deferreds.get('f-2.pdf')?.resolve({ record: record('2', 'f-2.pdf') });
      deferreds.get('f-3.pdf')?.resolve({ record: record('3', 'f-3.pdf') });
      await flushMicrotasks();
    });

    // All three files surface as committed records, as done cards in the UI.
    expect(screen.getByText('f-1.pdf')).toBeTruthy();
    expect(screen.getByText('f-2.pdf')).toBeTruthy();
    expect(screen.getByText('f-3.pdf')).toBeTruthy();
    const live = screen
      .getByText(/f-1\.pdf: done/)
      .textContent?.replace(/\s+/g, ' ');
    for (const name of ['f-1.pdf: done', 'f-2.pdf: done', 'f-3.pdf: done']) {
      expect(live).toContain(name);
    }
  });

  it('does not drop earlier completions when uploads settle in separate waves before the field re-renders', async () => {
    const user = userEvent.setup();
    const { repository, deferreds } = deferredRepository();

    // The parent deliberately freezes its `value` prop: it records what
    // `onChange` emits but does not feed a new array back to the field,
    // reproducing the window in which React has not re-rendered the field
    // between two commit drains (microtasks run ahead of the commit). The
    // old implementation re-read the lagging prop and replaced the records
    // committed by an earlier wave, dropping files.
    const committed: FileRecord[] = [];
    const handleChange = vi.fn((next: readonly FileRecord[]) => {
      committed.splice(0, committed.length, ...next);
    });
    const frozen: readonly FileRecord[] = [];

    render(
      <FileUploadField
        repository={repository}
        value={frozen}
        onChange={handleChange}
        multiple
      />,
    );

    await user.upload(screen.getByLabelText('Choose files'), [
      makeFile('f-1.pdf'),
      makeFile('f-2.pdf'),
      makeFile('f-3.pdf'),
    ]);

    // Wave 1: only the first file settles; its drain runs immediately.
    await act(async () => {
      deferreds.get('f-1.pdf')?.resolve({ record: record('1', 'f-1.pdf') });
      await flushMicrotasks();
    });
    expect(committed.map((item) => item.id)).toEqual(['1']);

    // Wave 2: the remaining two settle in a later drain, before any render
    // could have delivered the wave-1 value back to the field.
    await act(async () => {
      deferreds.get('f-2.pdf')?.resolve({ record: record('2', 'f-2.pdf') });
      deferreds.get('f-3.pdf')?.resolve({ record: record('3', 'f-3.pdf') });
      await flushMicrotasks();
    });

    // Exactly the bug from acceptance criterion 3: at least one file is lost
    // because a later drain clobbers the earlier completion.
    expect(committed.map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('keeps replacing instead of accumulating when multiple is false (one-to-one body)', async () => {
    const user = userEvent.setup();
    const { repository, deferreds } = deferredRepository();

    function Harness(): ReactElement {
      const [value, setValue] = useState<readonly FileRecord[]>([]);
      return (
        <FileUploadField
          repository={repository}
          value={value}
          onChange={setValue}
          multiple={false}
        />
      );
    }

    render(<Harness />);
    await user.upload(screen.getByLabelText('Choose file'), [
      makeFile('body-v1.pdf'),
    ]);
    await act(async () => {
      deferreds.get('body-v1.pdf')?.resolve({
        record: record('1', 'body-v1.pdf'),
      });
      await flushMicrotasks();
    });
    expect(screen.getAllByText('body-v1.pdf')).toHaveLength(1);

    await user.upload(screen.getByLabelText('Choose file'), [
      makeFile('body-v2.pdf'),
    ]);
    await act(async () => {
      deferreds.get('body-v2.pdf')?.resolve({
        record: record('2', 'body-v2.pdf'),
      });
      await flushMicrotasks();
    });

    // Still exactly one committed record, the newer upload.
    expect(screen.queryByText('body-v1.pdf')).toBeNull();
    expect(screen.getAllByText('body-v2.pdf')).toHaveLength(1);
  });
});
