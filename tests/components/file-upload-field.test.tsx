import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { FileUploadField } from '../../client/extensions/nocobase-file-component-ui/components/file-upload-field.js';

const repository = {
  uploadOne: vi.fn(async ({ file }: { file: File }) => ({
    record: {
      id: 'record-1',
      filename: file.name,
      ext: 'png',
      mimeType: file.type,
      size: file.size,
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
      contentUrl: '/main/uploads/record-1',
    },
  })),
  deleteOne: vi.fn(async () => undefined),
};

beforeEach(() => {
  repository.uploadOne.mockClear();
  repository.deleteOne.mockClear();
});

function renderField(props: Record<string, unknown> = {}): {
  onError: ReturnType<typeof vi.fn>;
  input: HTMLInputElement;
} {
  const onError = vi.fn();
  render(
    <FileUploadField
      repository={repository as never}
      value={[]}
      onChange={vi.fn()}
      onError={onError}
      multiple
      {...props}
    />,
  );
  return {
    onError,
    input: screen.getByLabelText(/choose/iu) as HTMLInputElement,
  };
}

// A file the browser accepts by name but the form refuses must stay visible as a failure. Dropping it silently is
// exactly the report this guards: `unsupported.exe` vanished, and `corrupt.png` showed "Done".
it('shows an unsupported file as failed instead of dropping it', async () => {
  // `applyAccept: false` so the test can hand the field a file the browser's own `accept` filter would hide; the
  // field's rejection is what is under test.
  const user = userEvent.setup({ applyAccept: false });
  const { onError, input } = renderField({ accept: ['image/*', '.pdf'] });
  const exe = new File([new Uint8Array([1, 2, 3])], 'unsupported.exe', {
    type: 'application/octet-stream',
  });

  await user.upload(input, exe);

  await screen.findByText('unsupported.exe');
  expect(screen.getByText(/not allowed/iu)).toBeTruthy();
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(repository.uploadOne).not.toHaveBeenCalled();
});

it('rejects a file whose content does not match its type, with the reason', async () => {
  const user = userEvent.setup({ applyAccept: false });
  const validate = vi.fn(async () => 'corrupt.png is not a valid image');
  const { onError, input } = renderField({
    accept: ['image/*'],
    validate,
  });
  const corrupt = new File([new Uint8Array([0, 1, 2, 3])], 'corrupt.png', {
    type: 'image/png',
  });

  await user.upload(input, corrupt);

  await screen.findByText('corrupt.png');
  await waitFor(() => expect(validate).toHaveBeenCalledOnce());
  await screen.findByText(/not a valid image/iu);
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(onError.mock.calls[0]?.[0]).toMatchObject({
    message: 'corrupt.png is not a valid image',
  });
  // The point of the check: a file that fails it is never stored.
  expect(repository.uploadOne).not.toHaveBeenCalled();
});
