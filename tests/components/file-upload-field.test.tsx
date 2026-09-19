import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadField } from '../../client/extensions/nocobase-file-component-ui/components/file-upload-field.js';

/**
 * Uploading locally can complete almost instantly. The control must still show
 * a processing state while the request is in flight, so a user can tell the
 * difference between "working" and "nothing happened".
 */
describe('FileUploadField upload feedback', () => {
  it('shows a processing state and progress bar while an upload is in flight', async () => {
    let release: ((value: unknown) => void) | undefined;
    const repository = {
      uploadOne: vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    };
    const onChange = vi.fn();

    render(
      <FileUploadField
        multiple
        maxSize={5 * 1024 * 1024}
        onChange={onChange}
        repository={repository as never}
        value={[]}
      />,
    );

    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    expect(file.size).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    release?.({
      record: {
        id: 'file-1',
        filename: 'note.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: file.size,
        contentUrl: '/main/uploads/recruitment-files/file-1.txt',
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });
});
