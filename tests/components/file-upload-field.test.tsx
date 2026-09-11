import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui';
import type {
  ClientFileRepository,
  FileRecord,
} from '@/extensions/nocobase-file-component-ui';

interface FakeUpload {
  readonly uploadOne: ReturnType<typeof vi.fn>;
  readonly deleteOne: ReturnType<typeof vi.fn>;
}

function createRepository(uploadRecord?: Partial<FileRecord>): FakeUpload {
  return {
    uploadOne: vi.fn(
      async ({ file }: { file: { name: string; size: number } }) => ({
        record: {
          id: `file-${file.name}`,
          disk: 'local',
          key: `objects/file-${file.name}`,
          filename: file.name,
          ext: file.name.split('.').at(-1),
          mimeType: 'text/plain',
          size: file.size,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          ...uploadRecord,
        },
      }),
    ),
    deleteOne: vi.fn(async () => ({})),
  };
}

function fakeFile(name: string, type = 'text/plain'): File {
  return new File(['content'], name, { type });
}

function findInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input;
}

describe('FileUploadField', () => {
  it('uploads one file in single mode and commits the record', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const { container } = render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[]}
        onChange={onChange}
        multiple={false}
      />,
    );

    fireEvent.change(findInput(container), {
      target: { files: [fakeFile('spec.txt')] },
    });

    await waitFor(() => expect(repository.uploadOne).toHaveBeenCalledTimes(1));
    expect(repository.uploadOne).toHaveBeenCalledWith(
      { file: expect.objectContaining({ name: 'spec.txt' }) },
      { signal: expect.any(AbortSignal) },
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ filename: 'spec.txt' }),
    ]);
  });

  it('replaces the single record when a new file is chosen', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const existing: FileRecord = {
      id: 'existing',
      disk: 'local',
      key: 'objects/existing.txt',
      filename: 'existing.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const { container } = render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[existing]}
        onChange={onChange}
        multiple={false}
      />,
    );

    fireEvent.change(findInput(container), {
      target: { files: [fakeFile('second.txt')] },
    });

    await waitFor(() => expect(repository.uploadOne).toHaveBeenCalledTimes(1));
    // Single mode keeps exactly one record: the newly chosen file replaces the
    // previous one, which is how the one-to-one main image is chosen.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ filename: 'second.txt' }),
    ]);
  });

  it('appends multiple files in multiple mode', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const { container } = render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[]}
        onChange={onChange}
        multiple
        maxFiles={3}
      />,
    );

    fireEvent.change(findInput(container), {
      target: { files: [fakeFile('one.txt'), fakeFile('two.txt')] },
    });

    await waitFor(() => expect(repository.uploadOne).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ filename: 'one.txt' }),
          expect.objectContaining({ filename: 'two.txt' }),
        ]),
      ),
    );
  });

  it('filters files that do not match the accept rules', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[]}
        onChange={onChange}
        onError={onError}
        accept={['.txt']}
        multiple
      />,
    );

    fireEvent.change(findInput(container), {
      target: { files: [fakeFile('image.png', 'image/png')] },
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(repository.uploadOne).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a record without deleteOne when removeOnDelete is false', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const record: FileRecord = {
      id: 'rec-1',
      disk: 'local',
      key: 'objects/rec-1.txt',
      filename: 'rec-1.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[record]}
        onChange={onChange}
        removeOnDelete={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove: rec-1.txt' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(repository.deleteOne).not.toHaveBeenCalled();
  });

  it('deletes the stored file first when removeOnDelete is true', async () => {
    const repository = createRepository();
    const onChange = vi.fn();
    const record: FileRecord = {
      id: 'rec-2',
      disk: 'local',
      key: 'objects/rec-2.txt',
      filename: 'rec-2.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[record]}
        onChange={onChange}
        removeOnDelete
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove: rec-2.txt' }));

    await waitFor(() =>
      expect(repository.deleteOne).toHaveBeenCalledWith({
        filter: { id: 'rec-2' },
      }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it('removes the selection when deleteOne reports the record is already gone', async () => {
    const repository = {
      ...createRepository(),
      deleteOne: vi.fn(async () => {
        throw Object.assign(new Error('Repository record was not found.'), {
          code: 'RECORD_NOT_FOUND',
          status: 404,
        });
      }),
    };
    const onChange = vi.fn();
    const onError = vi.fn();
    const record: FileRecord = {
      id: 'rec-gone',
      disk: 'local',
      key: 'objects/rec-gone.txt',
      filename: 'rec-gone.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[record]}
        onChange={onChange}
        onError={onError}
        removeOnDelete
      />,
    );

    // Deleting an already-deleted record (double-click / stale re-click) must
    // not surface the raw "Repository record was not found." error: the file
    // is gone, so the selection is simply kept in sync.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove: rec-gone.txt' }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores a second delete click while the first delete is in flight', async () => {
    let resolveDelete: (() => void) | undefined;
    const repository = {
      ...createRepository(),
      deleteOne: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          }),
      ),
    };
    const onChange = vi.fn();
    const record: FileRecord = {
      id: 'rec-slow',
      disk: 'local',
      key: 'objects/rec-slow.txt',
      filename: 'rec-slow.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[record]}
        onChange={onChange}
        removeOnDelete
      />,
    );

    const button = screen.getByRole('button', { name: 'Remove: rec-slow.txt' });
    fireEvent.click(button);
    fireEvent.click(button);
    resolveDelete?.();

    await waitFor(() => expect(repository.deleteOne).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it('reports a genuine delete failure and keeps the selection', async () => {
    const repository = {
      ...createRepository(),
      deleteOne: vi.fn(async () => {
        throw new Error('Storage is unavailable.');
      }),
    };
    const onChange = vi.fn();
    const onError = vi.fn();
    const record: FileRecord = {
      id: 'rec-broken',
      disk: 'local',
      key: 'objects/rec-broken.txt',
      filename: 'rec-broken.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    render(
      <FileUploadField
        repository={repository as unknown as ClientFileRepository}
        value={[record]}
        onChange={onChange}
        onError={onError}
        removeOnDelete
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove: rec-broken.txt' }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Storage is unavailable.' }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
