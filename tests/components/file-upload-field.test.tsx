import type { ClientFileRepository } from '@nocobase/app-plugin-file/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileUploadField } from '../../client/extensions/nocobase-file-component-ui/components/file-upload-field.js';

const uploadOne = vi.fn();

function repository(): ClientFileRepository {
  return { uploadOne } as unknown as ClientFileRepository;
}

beforeEach(() => {
  uploadOne.mockReset();
});

function pick(file: File): void {
  fireEvent.change(screen.getByLabelText('Add file'), {
    target: { files: [file] },
  });
}

describe('file upload field validation', () => {
  it('reports a file the validator rejects and never uploads it', async () => {
    const onError = vi.fn();
    const validateFile = vi.fn().mockResolvedValue('That image is damaged.');

    render(
      <FileUploadField
        repository={repository()}
        value={[]}
        onChange={vi.fn()}
        onError={onError}
        validateFile={validateFile}
        labels={{ choose: 'Add file', remove: 'Remove' }}
      />,
    );

    pick(new File([new Uint8Array([0x89, 0x50])], 'corrupt.png'));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(new Error('That image is damaged.')),
    );
    expect(validateFile).toHaveBeenCalledOnce();
    expect(uploadOne).not.toHaveBeenCalled();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('uploads a file the validator accepts', async () => {
    const record = {
      id: 'f-1',
      filename: 'shot.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 8,
      disk: 'local',
      key: 'shot.png',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    };
    uploadOne.mockResolvedValue({ record, createdTargets: [] });
    const onChange = vi.fn();

    render(
      <FileUploadField
        repository={repository()}
        value={[]}
        onChange={onChange}
        validateFile={() => null}
        labels={{ choose: 'Add file', remove: 'Remove' }}
      />,
    );

    pick(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([record]));
    expect(uploadOne).toHaveBeenCalledOnce();
  });
});
