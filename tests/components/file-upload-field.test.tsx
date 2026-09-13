import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  FileUploadField,
  type UploadedFile,
} from '../../client/components/file-upload-field.js';

const LABELS = {
  choose: 'Choose file',
  uploading: 'Uploading',
  remove: 'Remove',
  failed: 'Upload failed',
};

const RECORD: UploadedFile = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  filename: 'notes.txt',
  ext: 'txt',
  mimeType: 'text/plain',
  size: 5,
  contentUrl: '/main/uploads/resource-files/notes.txt',
};

function Harness({
  upload,
}: {
  readonly upload: (file: File) => Promise<UploadedFile>;
}): ReactElement {
  const [value, setValue] = useState<UploadedFile | null>(null);
  return (
    <FileUploadField
      value={value}
      onChange={setValue}
      upload={upload}
      labels={LABELS}
    />
  );
}

describe('FileUploadField', () => {
  it('uploads the chosen file and shows its name', async () => {
    const upload = vi.fn(async () => RECORD);
    render(<Harness upload={upload} />);

    await userEvent.upload(
      screen.getByLabelText('Choose file'),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('clears the uploaded file when removed', async () => {
    const upload = vi.fn(async () => RECORD);
    render(<Harness upload={upload} />);

    await userEvent.upload(
      screen.getByLabelText('Choose file'),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    );
    await screen.findByText('notes.txt');

    await userEvent.click(screen.getByLabelText('Remove: notes.txt'));
    await waitFor(() => {
      expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    });
  });

  it('reports a failed upload', async () => {
    const upload = vi.fn(async () => {
      throw new Error('network');
    });
    render(<Harness upload={upload} />);

    await userEvent.upload(
      screen.getByLabelText('Choose file'),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed');
  });
});
