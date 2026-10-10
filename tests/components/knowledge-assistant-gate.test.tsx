import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AssistantGate,
  DOCUMENT_ASSISTANT,
} from '@/pages/knowledge-assistant/assistant-gate.js';

import enUS from '../../client/locales/en-US.js';

// `vi.mock` factories run before this file's imports and code, so the state they read is created here.
const { ai } = vi.hoisted(() => ({
  ai: {
    configurationStatus: 'ready' as 'loading' | 'ready' | 'error',
    configurationError: undefined as unknown,
    modelConfigurationError: undefined as unknown,
    hasEnabledModels: true,
    employees: [] as readonly { readonly username: string }[],
  },
}));

vi.mock('@/extensions/nocobase-ai/index.js', () => ({
  useAI: () => ai,
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function renderGate(): void {
  render(
    <MemoryRouter>
      <TestI18nProvider runtime={runtime}>
        <AssistantGate>
          <p>chat surface</p>
        </AssistantGate>
      </TestI18nProvider>
    </MemoryRouter>,
  );
}

const employee = { username: DOCUMENT_ASSISTANT };

describe('knowledge assistant gate', () => {
  beforeEach(() => {
    ai.configurationStatus = 'ready';
    ai.configurationError = undefined;
    ai.modelConfigurationError = undefined;
    ai.hasEnabledModels = true;
    ai.employees = [employee];
  });

  it('shows a loading state while the AI runtime resolves', () => {
    ai.configurationStatus = 'loading';
    renderGate();

    expect(
      screen.getByText(enUS.knowledge.assistant.loading),
    ).toBeInTheDocument();
    expect(screen.queryByText('chat surface')).not.toBeInTheDocument();
  });

  it('explains an unavailable service and points at the documents page', () => {
    ai.configurationStatus = 'error';
    renderGate();

    expect(
      screen.getByText(enUS.knowledge.assistant.unavailable.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.knowledge.assistant.unavailable.configuration),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.knowledge.assistant.unavailable.hint),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: enUS.knowledge.assistant.openDocuments,
      }),
    ).toHaveAttribute('href', '/knowledge/documents');
  });

  it('reports a missing document assistant employee', () => {
    ai.employees = [];
    renderGate();

    expect(
      screen.getByText(enUS.knowledge.assistant.unavailable.employee),
    ).toBeInTheDocument();
  });

  it('reports that no model is enabled', () => {
    ai.hasEnabledModels = false;
    renderGate();

    expect(
      screen.getByText(enUS.knowledge.assistant.unavailable.models),
    ).toBeInTheDocument();
  });

  it('renders the chat surface once the service is ready', () => {
    renderGate();

    expect(screen.getByText('chat surface')).toBeInTheDocument();
  });
});
