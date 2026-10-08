import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import type {
  Material,
  MaterialFile,
} from '../../client/pages/materials/types.js';
import fileEnUS from '../../node_modules/@nocobase/app-plugin-file/dist/client/locales/en-US.js';

const viewer = vi.hoisted(() => ({
  load: vi.fn<(data: ArrayBuffer) => Promise<void>>(),
  destroy: vi.fn(),
}));

vi.mock('@silurus/ooxml/docx', () => ({
  DocxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));
vi.mock('@silurus/ooxml/xlsx', () => ({
  XlsxViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));
vi.mock('@silurus/ooxml/pptx', () => ({
  PptxScrollViewer: class {
    load = viewer.load;
    destroy = viewer.destroy;
  },
}));

// `vi.mock` factories run before this file's imports, so the shared objects are created here.
const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));

// A real runtime, so the page's wording is looked up the way it is in an application.
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
  namespaces: {
    '@nocobase/app-plugin-file': {
      ...fileEnUS,
      ...enUS.overrides['@nocobase/app-plugin-file'],
    },
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const PHOTO: MaterialFile = {
  id: 'c1b2c3d4-0001-4000-8000-000000000001',
  filename: '工地现场照片.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 199,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  contentUrl:
    '/main/projectMaterialFiles/c1b2c3d4-0001-4000-8000-000000000001.png',
};

const SPEC: MaterialFile = {
  id: 'c1b2c3d4-0002-4000-8000-000000000002',
  filename: '需求文档.docx',
  ext: 'docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 1311,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  contentUrl:
    '/main/projectMaterialFiles/c1b2c3d4-0002-4000-8000-000000000002.docx',
};

const MATERIAL: Material = {
  id: 'b1b2c3d4-0001-4000-8000-000000000001',
  title: '工地现场照片归档',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  files: [PHOTO, SPEC],
};

const reloadList = vi.fn();

/**
 * Renders the detail page under a parent list route, as the real tree does, so
 * the page reads the list's outlet context and can ask it to reload a row.
 */
async function renderDetail(material: Material = MATERIAL) {
  const MaterialDetailPage = (
    await import('../../client/pages/materials/detail.js')
  ).default;

  const router = createMemoryRouter(
    [
      {
        path: '/materials',
        element: <Outlet context={{ reload: reloadList }} />,
        children: [{ path: ':materialId', element: <MaterialDetailPage /> }],
      },
    ],
    { initialEntries: [`/materials/${material.id}`] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

/** The row of one attachment in the material's attachment list. */
function attachmentRow(filename: string): HTMLElement {
  const row = screen.getByText(filename).closest('li');
  if (!row) throw new Error(`No attachment row for ${filename}`);
  return row;
}

beforeEach(() => {
  api.request.mockReset().mockResolvedValue({ data: MATERIAL });
  toaster.show.mockReset();
  reloadList.mockReset();
  viewer.load.mockReset().mockResolvedValue(undefined);
  viewer.destroy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/**
 * The detail page shows the attachments' real content, not their names alone: a
 * PNG is previewed inline from its own content URL, and a DOCX is handed to the
 * local Office Open XML previewer, which fetches the same URL itself (B01, B02).
 */
it('previews stored attachments from their own content URLs (B01, B02)', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetchMock);

  await renderDetail();
  expect(
    await screen.findByRole('heading', { name: MATERIAL.title }),
  ).toBeInTheDocument();

  // B01: the image element points at the attachment's content URL.
  const preview = document.querySelector('[data-slot="material-preview"]');
  expect(preview).not.toBeNull();
  const image = within(preview as HTMLElement).getByRole('img');
  expect(image).toHaveAttribute('src', PHOTO.contentUrl);

  // B02: selecting the document renders the document's body, loaded locally
  // from its content URL — no third-party viewer, no download-only fallback.
  await userEvent.click(
    within(attachmentRow(SPEC.filename)).getAllByRole('button')[0],
  );
  await waitFor(() => expect(viewer.load).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith(SPEC.contentUrl, {
    credentials: 'same-origin',
    signal: expect.any(AbortSignal),
  });
  expect(
    document.querySelector('[data-office-open-xml-format="docx"]'),
  ).not.toBeNull();
  expect(document.querySelector('iframe')).toBeNull();
});

/**
 * Removing an attachment and saving detaches it from the material: the save
 * sends the surviving set, the page shows the record the server returned, and
 * the list behind it is told to reload (B04).
 */
it('detaches a removed attachment on save and reloads the list (B04)', async () => {
  const detached: Material = { ...MATERIAL, files: [SPEC] };
  api.request
    .mockReset()
    .mockResolvedValueOnce({ data: MATERIAL })
    .mockResolvedValueOnce({ data: detached });

  await renderDetail();
  expect(
    await screen.findByRole('heading', { name: MATERIAL.title }),
  ).toBeInTheDocument();

  await userEvent.click(
    screen.getByRole('button', {
      name: `${enUS.materials.detail.remove}: ${PHOTO.filename}`,
    }),
  );
  // Nothing is written until Save: removing is local until the user confirms.
  expect(api.request).toHaveBeenCalledTimes(1);

  await userEvent.click(
    screen.getByRole('button', { name: enUS.actions.save }),
  );

  await waitFor(() =>
    expect(api.request).toHaveBeenLastCalledWith({
      path: `projectMaterials/${MATERIAL.id}`,
      method: 'PATCH',
      json: { fileIds: [SPEC.id] },
    }),
  );
  expect(toaster.show).toHaveBeenCalledWith({
    type: 'success',
    title: enUS.materials.detail.removeSaved,
  });
  // The page reflects the saved record, and the list's row count is refreshed.
  await waitFor(() => expect(screen.queryByText(PHOTO.filename)).toBeNull());
  expect(reloadList).toHaveBeenCalled();
});

/**
 * A material the signed-in user cannot read answers 404, whichever link brought
 * them there; the page says so instead of rendering an empty material (B05).
 */
it('explains a material it may not read instead of showing it (B05)', async () => {
  const { ApiClientError } = await import('@nocobase/app-client');
  api.request.mockReset().mockRejectedValue(
    new ApiClientError('not found', {
      status: 404,
      reason: 'MATERIAL_NOT_FOUND',
      domain: 'projectMaterials',
      method: 'GET',
      url: `/api/projectMaterials/${MATERIAL.id}`,
    }),
  );

  await renderDetail();
  expect(
    await screen.findByText(enUS.materials.error.notFound),
  ).toBeInTheDocument();
  expect(document.querySelector('[data-slot="material-preview"]')).toBeNull();
});
