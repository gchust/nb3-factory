import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

// `vi.mock` factories run before this file's imports, so the shared objects are created here.
const { api, toaster, manager, uploadOne } = vi.hoisted(() => {
  const uploadOne = vi.fn();
  return {
    api: { request: vi.fn() },
    toaster: { show: vi.fn(), close: vi.fn() },
    manager: { repository: () => ({ uploadOne }) },
    uploadOne,
  };
});

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module so `ApiClientError` stays the class the form checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useService: () => manager,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));

import { MaterialsForm } from '../../client/pages/materials/materials-form.js';
import type {
  Material,
  MaterialFile,
} from '../../client/pages/materials/types.js';

const UPLOADED: MaterialFile = {
  id: 'c1b2c3d4-0001-4000-8000-000000000010',
  filename: '现场照片.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 199,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  contentUrl:
    '/main/projectMaterialFiles/c1b2c3d4-0001-4000-8000-000000000010.png',
};

const SAVED: Material = {
  id: 'd1b2c3d4-0001-4000-8000-000000000001',
  title: '东门工地现场照片',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  files: [UPLOADED],
};

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
  uploadOne.mockReset().mockResolvedValue({ record: UPLOADED });
});

/**
 * Uploading and saving are two submissions (B03): a file uploads as soon as it
 * is chosen, and a blank title only refuses the business save. The selection
 * therefore survives the refusal, and adding the title saves it without
 * uploading anything again.
 */
it('keeps an uploaded attachment when a blank title refuses the save (B03)', async () => {
  api.request.mockResolvedValue({ data: SAVED });
  const onSubmitted = vi.fn();
  const statuses: string[] = [];
  const { container } = render(
    <MaterialsForm
      formId='create-form'
      onSubmitted={onSubmitted}
      onUploadStatusChange={(status) => statuses.push(status)}
    />,
  );

  const input = container.querySelector('input[type="file"]');
  expect(input).not.toBeNull();
  await userEvent.upload(
    input as HTMLInputElement,
    new File([new Uint8Array([137, 80, 78, 71])], '现场照片.png', {
      type: 'image/png',
    }),
  );

  // The upload has finished before the save is attempted; otherwise the form
  // refuses for a different reason and the test would pass for the wrong one.
  await waitFor(() => expect(statuses.at(-1)).toBe('idle'));
  expect(await screen.findByText('现场照片.png')).toBeInTheDocument();

  const form = container.querySelector('form');
  fireEvent.submit(form as HTMLFormElement);

  expect(
    await screen.findByText('materials.form.titleRequired'),
  ).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
  // The attachment is still selected after the refused save.
  expect(screen.getByText('现场照片.png')).toBeInTheDocument();

  await userEvent.type(
    container.querySelector('#create-form-title') as HTMLInputElement,
    '东门工地现场照片',
  );
  fireEvent.submit(form as HTMLFormElement);

  await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
  expect(api.request).toHaveBeenCalledWith({
    path: 'projectMaterials',
    method: 'POST',
    json: { title: '东门工地现场照片', fileIds: [UPLOADED.id] },
  });
  // No second upload: the record was kept, not re-sent to the file API.
  expect(uploadOne).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(SAVED));
});
