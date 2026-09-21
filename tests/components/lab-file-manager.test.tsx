/**
 * The laboratory attachment viewer and uploader.
 *
 * Three defects were observed in the running application and are guarded here: the PDF page
 * indicator and the long-text notice rendered their i18n placeholders literally, the file picker
 * accepted only one file, and the PDF viewer reloaded the document per page, which left the second
 * and third page blank when the previous load was torn down mid-flight. The tests render against
 * the real locale files and the real component so a mismatch between the arguments a component
 * passes and the placeholders a message declares fails the build.
 */
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabFilePreview } from '../../client/components/lab-file-preview.js';
import { LabFileManager } from '../../client/components/lab-file-manager.js';
import locales from '../../client/locales/index.js';
import type { LabFileView } from '../../client/lib/lab-types.js';

const api = vi.hoisted(() => ({
  files: vi.fn<() => Promise<LabFileView[]>>(async () => []),
  uploadFile: vi.fn(async () => ({}) as LabFileView),
  updateFile: vi.fn(async () => ({}) as LabFileView),
  deleteFile: vi.fn(async () => ({ id: 'deleted' })),
}));

vi.mock('@/lib/lab-api', () => ({ useLabApi: () => api }));

/**
 * A three-page PDF document whose pages can be tracked. The document is deliberately the same
 * object every time it is returned, so the viewer reloading it is observable as a second
 * `getDocument` call rather than a fresh mock.
 */
const pdfjs = vi.hoisted(() => {
  const makePage = () => ({
    getViewport: () => ({ width: 100, height: 200 }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  });
  const document = {
    numPages: 3,
    getPage: vi.fn(async () => makePage()),
    destroy: vi.fn(async () => undefined),
  };
  return {
    document,
    getDocument: vi.fn(() => ({ promise: Promise.resolve(document) })),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdfjs.GlobalWorkerOptions,
  getDocument: pdfjs.getDocument,
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf.worker.mjs',
}));

async function runtime(locale = 'en-US') {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init(locale);
  return value;
}

function textFile(overrides: Partial<LabFileView> = {}): LabFileView {
  return {
    id: 'file-1',
    filename: 'risk-notes-zh.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    size: 7500,
    purpose: 'risk_notice',
    targetType: 'equipment',
    targetId: '1',
    remark: null,
    uploadedById: 'user-1',
    uploadedByName: 'Dr. Lin',
    createdAt: '2026-09-21T08:00:00.000Z',
    contentUrl: '/main/lab-files/file-1/content',
    ...overrides,
  };
}

function pdfFile(overrides: Partial<LabFileView> = {}): LabFileView {
  return textFile({
    id: 'pdf-1',
    filename: 'calibration-cert-3page.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    size: 1024,
    contentUrl: '/main/lab-files/pdf-1/content',
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  api.files.mockResolvedValue([]);
  api.files.mockClear();
  api.uploadFile.mockClear();
  pdfjs.getDocument.mockClear();
  pdfjs.document.getPage.mockClear();
  pdfjs.document.destroy.mockClear();
});

describe('laboratory attachment preview translations', () => {
  it('renders the truncation notice with every placeholder resolved', async () => {
    const value = await runtime();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('中'.repeat(2500), {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ),
    );

    render(
      <I18nProvider runtime={value}>
        <LabFilePreview
          files={[textFile()]}
          selectedId='file-1'
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByText(
        /Only the first 2000 of 2500 characters are shown\./,
      ),
    ).toBeVisible();
    expect(document.body.textContent ?? '').not.toContain('{{');
  });

  it('translates the PDF page indicator in both languages', async () => {
    for (const [locale, expected] of [
      ['en-US', 'Page 2 of 3'],
      ['zh-CN', '第 2 页，共 3 页'],
    ] as const) {
      const value = await runtime(locale);
      expect(value.getFixedT('app')('lab.pageOf', { page: 2, total: 3 })).toBe(
        expected,
      );
    }
  });

  it('resolves every permission set title the reference seed assigns', async () => {
    // The keys mirror `permissionTitle` in 202610010010_seed_lab_reference_data.ts. A missing one leaves the
    // Users page showing the raw key, which makes the seeded role accounts unreadable.
    const expected: Record<string, readonly [string, string]> = {
      'permissionSets.labAdmin': ['Laboratory administrator', '实验室管理员'],
      'permissionSets.labTeacher': ['Instructor', '指导教师'],
      'permissionSets.labTechnician': ['Equipment technician', '设备技术员'],
      'permissionSets.labSafetyOfficer': ['Safety officer', '安全员'],
      'permissionSets.labStudent': ['Student', '学生'],
    };
    for (const [locale, index] of [
      ['en-US', 0],
      ['zh-CN', 1],
    ] as const) {
      const t = (await runtime(locale)).getFixedT('app');
      for (const [key, wording] of Object.entries(expected)) {
        expect(t(key)).toBe(wording[index]);
      }
    }
  });
});

describe('laboratory attachment PDF viewer', () => {
  it('loads the document once and reuses it when the page changes', async () => {
    const value = await runtime();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new Blob([new Uint8Array([4, 5, 6])], {
              type: 'application/pdf',
            }),
          ),
      ),
    );
    // jsdom implements neither object-URL helper; the component only needs a truthy URL to show
    // the preview, since the PDF is read back from the fetched blob.
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:pdf-1');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    // jsdom has no canvas implementation; a minimal 2D context lets the render path run so the
    // test observes the same code the browser does.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        canvas: null,
        fillStyle: '',
        fillRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D);

    render(
      <I18nProvider runtime={value}>
        <LabFilePreview
          files={[pdfFile()]}
          selectedId='pdf-1'
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByText('Page 1 of 3', undefined, { timeout: 5000 }),
    ).toBeVisible();
    await waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(
      () => expect(pdfjs.document.getPage).toHaveBeenCalledWith(2),
      { timeout: 5000 },
    );
    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
    // The same in-memory document serves every page, so a page change must not refetch or destroy
    // it. Recreating it here is what blanked the later pages in the running application.
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfjs.document.destroy).not.toHaveBeenCalled();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    getContext.mockRestore();
  });
});

describe('laboratory attachment upload', () => {
  it('shows who uploaded each attachment in the list, preview and edit dialog', async () => {
    const value = await runtime();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('notes', {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ),
    );
    api.files.mockResolvedValue([textFile()]);

    render(
      <I18nProvider runtime={value}>
        <LabFileManager targetType='equipment' targetId={1} canWrite />
      </I18nProvider>,
    );

    expect(await screen.findByText(/Uploaded by Dr\. Lin/)).toBeVisible();

    fireEvent.click(screen.getByTitle('Preview'));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Uploaded by Dr. Lin',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTitle('Edit'));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Uploaded by Dr. Lin',
    );
  });

  it('refuses a selection over the file-count limit and explains why', async () => {
    const value = await runtime();
    const { container } = render(
      <I18nProvider runtime={value}>
        <LabFileManager targetType='equipment' targetId={1} canWrite />
      </I18nProvider>,
    );

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const files = Array.from(
      { length: 21 },
      (_, index) =>
        new File([new Uint8Array([1])], `file-${index}.png`, {
          type: 'image/png',
        }),
    );
    fireEvent.change(input!, { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(
      await screen.findByText('You can upload up to 20 files at once.'),
    ).toBeVisible();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('refuses a selection over the total-size limit and explains why', async () => {
    const value = await runtime();
    const { container } = render(
      <I18nProvider runtime={value}>
        <LabFileManager targetType='equipment' targetId={1} canWrite />
      </I18nProvider>,
    );

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    const huge = new File([new Uint8Array([1])], 'huge.png', {
      type: 'image/png',
    });
    // The buffer stays tiny; only the declared size drives the batch check.
    Object.defineProperty(huge, 'size', { value: 101 * 1024 * 1024 });
    fireEvent.change(input!, { target: { files: [huge] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(
      await screen.findByText('The batch is 101 MB, over the 100 MB limit.'),
    ).toBeVisible();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('accepts a multi-file selection and uploads every chosen file', async () => {
    const value = await runtime();
    const { container } = render(
      <I18nProvider runtime={value}>
        <LabFileManager targetType='equipment' targetId={1} canWrite />
      </I18nProvider>,
    );

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.multiple).toBe(true);

    const png = new File([new Uint8Array([1, 2, 3])], 'nameplate.png', {
      type: 'image/png',
    });
    const pdf = new File([new Uint8Array([4, 5, 6])], 'manual.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(input!, { target: { files: [png, pdf] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(2));
    expect(
      api.uploadFile.mock.calls
        .map((call) => (call[0] as { file: File }).file.name)
        .sort(),
    ).toEqual(['manual.pdf', 'nameplate.png']);
  });
});
