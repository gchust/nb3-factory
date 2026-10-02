import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AssistantPage from '../../client/pages/assistant/index.js';
import MaterialsPage from '../../client/pages/materials/index.js';

interface DocumentRecord {
  id: string;
  title: string;
  content: string;
}

type AIStatus = 'loading' | 'ready' | 'error';

const repository = vi.hoisted(() => ({
  findMany: vi.fn(),
  createOne: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
}));
const canManage = vi.hoisted(() => ({ value: false }));
const ai = vi.hoisted(() => ({
  value: {
    configurationStatus: 'ready' as AIStatus,
    configurationError: undefined as Error | undefined,
    modelConfigurationError: undefined as Error | undefined,
    hasEnabledModels: false,
    employees: [{ username: 'materials-assistant' }],
  },
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useApiClient: () => ({
      repository: () => ({
        findMany: repository.findMany,
        createOne: repository.createOne,
        updateOne: repository.updateOne,
        deleteOne: repository.deleteOne,
      }),
    }),
    useToaster: () => ({ show: vi.fn() }),
  };
});

vi.mock('@nocobase/app-plugin-authorization/client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@nocobase/app-plugin-authorization/client')
    >();
  return {
    ...actual,
    useCan: () => ({
      can: canManage.value,
      isPending: false,
      error: undefined,
      retry: () => undefined,
    }),
  };
});

vi.mock('@nocobase/i18n/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/i18n/client')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    }),
  };
});

// The assistant page is tested against its readiness gate, not the whole chat
// runtime, so the extension's surfaces are replaced with markers.
vi.mock('@/extensions/nocobase-ai', () => ({
  NocoBaseAIRootProvider: ({ children }: { children: ReactNode }) => children,
  useAI: () => ai.value,
  AIChatProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid='ai-provider'>{children}</div>
  ),
  ChatPage: ({ children }: { children: ReactNode }) => (
    <div data-testid='chat-page'>{children}</div>
  ),
  AIChatWindow: () => <div data-testid='chat-window' />,
}));

function renderInRouter(element: ReactElement): void {
  render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('document library page', () => {
  beforeEach(() => {
    canManage.value = false;
    repository.findMany.mockReset();
    repository.findMany.mockResolvedValue([
      { id: 'doc-a', title: 'Repair line', content: '400-000-7316' },
      { id: 'doc-b', title: 'Inspection interval', content: '45 days' },
    ] as DocumentRecord[]);
  });

  it('shows a colleague the readable documents without maintenance controls', async () => {
    renderInRouter(<MaterialsPage />);

    expect(await screen.findByText('Repair line')).toBeVisible();
    expect(screen.getByText('Inspection interval')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'materials.create' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'materials.edit' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'materials.delete' }),
    ).toBeNull();
  });

  it('gives a supervisor the create, edit and delete controls', async () => {
    canManage.value = true;
    renderInRouter(<MaterialsPage />);

    expect(
      await screen.findByRole('button', { name: 'materials.create' }),
    ).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'materials.edit' }),
      ).toHaveLength(2);
    });
    expect(
      screen.getAllByRole('button', { name: 'materials.delete' }),
    ).toHaveLength(2);
  });
});

describe('document assistant page', () => {
  beforeEach(() => {
    ai.value = {
      ...ai.value,
      configurationError: undefined,
      modelConfigurationError: undefined,
      configurationStatus: 'ready',
      hasEnabledModels: false,
      employees: [{ username: 'materials-assistant' }],
    };
  });

  it('states that the assistant is unavailable and links to the library when no model is enabled', async () => {
    renderInRouter(<AssistantPage />);

    expect(await screen.findByText('assistant.unavailableTitle')).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/materials');
    expect(screen.queryByTestId('chat-window')).toBeNull();
  });

  it('mounts the chat once a model is enabled', async () => {
    ai.value = { ...ai.value, hasEnabledModels: true };
    renderInRouter(<AssistantPage />);

    expect(await screen.findByTestId('chat-window')).toBeVisible();
    expect(screen.queryByText('assistant.unavailableTitle')).toBeNull();
  });

  it('reports a loading state while the AI configuration resolves', async () => {
    ai.value = { ...ai.value, configurationStatus: 'loading' };
    renderInRouter(<AssistantPage />);

    expect(await screen.findByText('assistant.loadingTitle')).toBeVisible();
  });

  it('refuses to chat when the document assistant is not registered', async () => {
    ai.value = { ...ai.value, hasEnabledModels: true, employees: [] };
    renderInRouter(<AssistantPage />);

    expect(await screen.findByText('assistant.unavailableTitle')).toBeVisible();
    expect(screen.queryByTestId('chat-window')).toBeNull();
  });

  it('reports a failure when the AI configuration cannot be loaded', async () => {
    ai.value = {
      ...ai.value,
      configurationStatus: 'error',
      configurationError: new Error('Unreachable'),
    };
    renderInRouter(<AssistantPage />);

    expect(await screen.findByText('assistant.unavailableTitle')).toBeVisible();
    expect(screen.getByText('Unreachable')).toBeVisible();
  });
});
