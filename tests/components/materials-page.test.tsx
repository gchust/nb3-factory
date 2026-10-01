import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError } from '@nocobase/app-client';
import { beforeEach, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';
import MaterialsPage from '../../client/pages/materials/index.js';
import { CreateMaterialDialog } from '../../client/pages/materials/material-dialog.js';
import { MaterialDetailSheet } from '../../client/pages/materials/material-sheet.js';

/**
 * The materials page against the real English wording.
 *
 * `materials-service.test.ts` covers the server records and `materials-files.test.ts`
 * covers the upload gate; this is the part those cannot see — that the screen renders
 * the records it is given and that the retry and detach flows send the ids the user
 * still has on screen. The upload field is stubbed so a test can produce an
 * already-uploaded file without a storage backend.
 */

const enUS = appEnUS;

function lookup(key: string): string | undefined {
  const flat = (enUS as Record<string, unknown>)[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = enUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function translate(key: string, options?: Record<string, unknown>): string {
  const template = lookup(key) ?? options?.defaultValue;
  if (typeof template !== 'string') return key;
  return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
    options && name in options ? String(options[name]) : whole,
  );
}

const client = vi.hoisted(() => ({ request: vi.fn() }));
const toaster = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: translate,
  }),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => client,
  useToaster: () => toaster,
}));

vi.mock('../../client/pages/materials/files.js', () => ({
  MATERIAL_ACCEPT: 'image/png',
  MATERIAL_MAX_SIZE: 5 * 1024 * 1024,
  useMaterialFileRepository: () => ({ uploadOne: vi.fn() }),
}));

interface StubFile {
  readonly id: string;
  readonly filename: string;
}

const upload = vi.hoisted(() => ({ next: [] as StubFile[] }));

vi.mock('@/extensions/nocobase-file-component-ui', () => ({
  FileUploadField: (props: {
    readonly value?: readonly StubFile[];
    readonly onChange?: (files: StubFile[]) => void;
  }) => (
    <div>
      <button
        type='button'
        onClick={() =>
          props.onChange?.([...(props.value ?? []), ...upload.next])
        }
      >
        {translate('materials.chooseFiles')}
      </button>
      {(props.value ?? []).map((file) => (
        <span key={file.id}>{file.filename}</span>
      ))}
    </div>
  ),
  FileList: (props: {
    readonly files: readonly StubFile[];
    readonly onRemove?: (file: StubFile) => void;
  }) => (
    <ul>
      {props.files.map((file) => (
        <li key={file.id}>
          <span>{file.filename}</span>
          <button type='button' onClick={() => props.onRemove?.(file)}>
            {`remove:${file.filename}`}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

function stubFile(
  id: string,
  filename: string,
): StubFile & {
  readonly disk: string;
  readonly key: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
} {
  return {
    id,
    filename,
    disk: 'local',
    key: `objects/${id}.png`,
    ext: 'png',
    mimeType: 'image/png',
    size: 99,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

function material(
  id: string,
  title: string,
  files: readonly StubFile[] = [],
): Record<string, unknown> {
  return {
    id,
    title,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    files,
  };
}

beforeEach(() => {
  client.request.mockReset();
  toaster.show.mockReset();
  upload.next = [];
});

it('lists the materials the API returns with their attachment counts', async () => {
  client.request.mockResolvedValueOnce({
    data: [
      material('m1', 'Launch photos', [stubFile('f1', 'photo.png')]),
      material('m2', 'Empty material'),
    ],
  });
  render(<MaterialsPage />);
  expect(
    await screen.findByRole('button', { name: 'Launch photos' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Empty material')).toBeInTheDocument();
  expect(screen.getByText('1 file(s)')).toBeInTheDocument();
  expect(screen.getByText('0 file(s)')).toBeInTheDocument();
});

it('shows the empty state when the owner has no materials', async () => {
  client.request.mockResolvedValueOnce({ data: [] });
  render(<MaterialsPage />);
  expect(
    await screen.findByText(translate('materials.emptyTitle')),
  ).toBeInTheDocument();
});

it('offers a retry when the list fails to load', async () => {
  client.request
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: [] });
  render(<MaterialsPage />);
  expect(
    await screen.findByText(translate('materials.errors.loadFailed')),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('status.retry'),
    }) as HTMLElement,
  );
  expect(
    await screen.findByText(translate('materials.emptyTitle')),
  ).toBeInTheDocument();
  expect(client.request).toHaveBeenCalledTimes(2);
});

it('keeps an uploaded attachment after a rejected save and reuses its id', async () => {
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  upload.next = [stubFile('f1', 'photo.png')];
  render(
    <CreateMaterialDialog
      open
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.chooseFiles'),
    }) as HTMLElement,
  );
  expect(screen.getByText('photo.png')).toBeInTheDocument();

  // Saving with no title is refused before anything is sent, and the attachment stays.
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.create'),
    }) as HTMLElement,
  );
  expect(
    await screen.findByText(translate('materials.errors.titleRequired')),
  ).toBeInTheDocument();
  expect(client.request).not.toHaveBeenCalled();
  expect(screen.getByText('photo.png')).toBeInTheDocument();

  // The server can still reject the save; the same file id is sent again, not re-uploaded.
  client.request.mockRejectedValueOnce(
    new ApiClientError('title required', {
      status: 400,
      code: 'VALIDATION_TITLE_REQUIRED',
      method: 'POST',
      url: '/api/materials',
    }),
  );
  const title = screen.getByLabelText(
    translate('materials.titleLabel'),
  ) as HTMLInputElement;
  fireEvent.change(title, { target: { value: 'Launch photos' } });
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.create'),
    }) as HTMLElement,
  );
  await waitFor(() => expect(client.request).toHaveBeenCalledTimes(1));
  expect(client.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: 'materials',
      method: 'POST',
      json: { title: 'Launch photos', fileIds: ['f1'] },
    }),
  );
  expect(
    await screen.findByText(translate('materials.errors.titleRequired')),
  ).toBeInTheDocument();
  expect(screen.getByText('photo.png')).toBeInTheDocument();
});

it('detaches a removed attachment by saving the remaining ids', async () => {
  const onChanged = vi.fn();
  const photo = stubFile('f1', 'photo.png');
  const doc = stubFile('f2', 'brief.docx');
  client.request.mockResolvedValueOnce({
    data: material('m1', 'Launch photos', [photo, doc]),
  });
  render(
    <MaterialDetailSheet
      materialId='m1'
      onOpenChange={vi.fn()}
      onChanged={onChanged}
      onDeleted={vi.fn()}
    />,
  );
  expect(await screen.findByText('photo.png')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'remove:photo.png' }) as HTMLElement,
  );
  expect(screen.queryByText('photo.png')).toBeNull();

  client.request.mockResolvedValueOnce({
    data: material('m1', 'Launch photos', [doc]),
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.save'),
    }) as HTMLElement,
  );
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(client.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: 'materials/m1',
      method: 'PATCH',
      json: { title: 'Launch photos', fileIds: ['f2'] },
    }),
  );
});

it('deletes the material after confirming', async () => {
  const onDeleted = vi.fn();
  const onOpenChange = vi.fn();
  client.request.mockResolvedValueOnce({
    data: material('m1', 'Launch photos', [stubFile('f1', 'photo.png')]),
  });
  render(
    <MaterialDetailSheet
      materialId='m1'
      onOpenChange={onOpenChange}
      onChanged={vi.fn()}
      onDeleted={onDeleted}
    />,
  );
  expect(await screen.findByText('photo.png')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.delete'),
    }) as HTMLElement,
  );
  client.request.mockResolvedValueOnce({ data: { id: 'm1' } });
  fireEvent.click(
    screen.getByRole('button', {
      name: translate('materials.deleteConfirm'),
    }) as HTMLElement,
  );
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  expect(client.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: 'materials/m1', method: 'DELETE' }),
  );
});
