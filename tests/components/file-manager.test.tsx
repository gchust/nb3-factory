import {
  ClientApplication,
  ClientApplicationContext,
  createAppClientConfig,
  defineAppClientRenderConfig,
} from '@nocobase/app-client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileManager } from '@/components/sales/file-manager';

const { api } = vi.hoisted(() => ({
  api: {
    files: vi.fn(),
    uploadFiles: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock('@/lib/sales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sales')>();
  return { ...actual, useSalesApi: () => api };
});

const APP = '@nocobase/app-template-default';
const applications: ClientApplication[] = [];

const MESSAGES: Record<string, string> = {
  'sales.files.upload': 'Upload files',
  'sales.files.uploading': 'Uploading…',
  'sales.files.cancelUpload': 'Cancel upload',
  'sales.files.cancelling': 'Cancelling…',
  'sales.files.cancelled': 'Upload cancelled. Nothing was saved.',
  'sales.files.cancelCleanupFailed':
    'Upload cancelled, but {{count}} file(s) were saved and could not be removed. Check the list above.',
  'sales.files.uploadFailedRecheck':
    'The upload failed. The list below has been refreshed and shows what was saved — do not upload the same files again.',
  'sales.files.tooLargeServer':
    'A file is larger than {{size}} MB, so nothing was uploaded.',
  'sales.files.empty': 'No file yet.',
  'sales.files.rules': 'Up to {{count}} files, {{size}} MB each',
};

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () => Promise.resolve({ default: MESSAGES }),
  });
  await runtime.init('en-US');
  return runtime;
}

async function createApp(): Promise<ClientApplication> {
  const appRuntime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: APP,
      createAppConfig: createAppClientConfig,
      plugins: defineClientPlugins([]),
    }),
    { rawConfig: { api: { baseURL: '/api' } } },
  );
  const app = new ClientApplication({
    runtime: appRuntime,
    createRenderConfig: () => defineAppClientRenderConfig({ routes: null }),
  });
  await app.start();
  applications.push(app);
  return app;
}

function renderManager(app: ClientApplication, runtime: I18nRuntime) {
  return render(
    <ClientApplicationContext.Provider value={app}>
      <I18nProvider runtime={runtime}>
        <FileManager category='opportunity' opportunityId='opp-1' />
      </I18nProvider>
    </ClientApplicationContext.Provider>,
  );
}

function pickFiles(files: File[]): void {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error('file input missing');
  fireEvent.change(input, { target: { files } });
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.shutdown()));
  vi.clearAllMocks();
});

beforeEach(() => {
  api.files.mockResolvedValue({ data: [] });
});

describe('FileManager', () => {
  it('shows the refreshed list instead of claiming a failed upload saved nothing', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    api.uploadFiles.mockRejectedValue(new Error('network down'));

    renderManager(app, runtime);
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(1));

    pickFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i);
    // The list is re-read so the user sees what actually exists server-side.
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(2));
  });

  it('cancels an in-flight upload by removing what it created, leaving nothing saved', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    const created = [
      {
        id: 'file-1',
        filename: 'notes.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 5,
        category: 'opportunity',
        customerId: null,
        opportunityId: 'opp-1',
        followUpId: null,
        uploadedById: 'user-1',
        uploadedByName: 'User',
        createdAt: null,
        contentUrl: '/api/sales/files/file-1/content',
      },
    ];
    let release: (value: { data: typeof created }) => void = () => undefined;
    api.uploadFiles.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    api.deleteFile.mockResolvedValue(undefined);

    renderManager(app, runtime);
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(1));

    pickFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
    await screen.findByRole('button', { name: /cancel upload/i });
    fireEvent.click(screen.getByRole('button', { name: /cancel upload/i }));

    // The request is allowed to settle so the response says what was stored;
    // everything it created is then removed, so cancel leaves no file behind.
    release({ data: created });
    await waitFor(() => expect(api.deleteFile).toHaveBeenCalledWith('file-1'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/nothing was saved/i),
    );
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(2));
  });

  it('says files stayed when cancelling could not remove them', async () => {
    const app = await createApp();
    const runtime = await createRuntime();
    const created = [
      {
        id: 'file-2',
        filename: 'notes.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 5,
        category: 'opportunity',
        customerId: null,
        opportunityId: 'opp-1',
        followUpId: null,
        uploadedById: 'user-1',
        uploadedByName: 'User',
        createdAt: null,
        contentUrl: '/api/sales/files/file-2/content',
      },
    ];
    let release: (value: { data: typeof created }) => void = () => undefined;
    api.uploadFiles.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    api.deleteFile.mockRejectedValue(new Error('delete failed'));

    renderManager(app, runtime);
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(1));

    pickFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
    await screen.findByRole('button', { name: /cancel upload/i });
    fireEvent.click(screen.getByRole('button', { name: /cancel upload/i }));
    release({ data: created });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not be removed/i,
      ),
    );
    await waitFor(() => expect(api.files).toHaveBeenCalledTimes(2));
  });
});
