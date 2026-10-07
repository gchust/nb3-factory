import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

const enRuntime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const zhRuntime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: zhCN },
});

function English({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={enRuntime}>{children}</TestI18nProvider>;
}

function Chinese({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={zhRuntime}>{children}</TestI18nProvider>;
}

describe('PipelineSmokePage', () => {
  it('starts at zero and gains one per click', async () => {
    const user = userEvent.setup();
    render(<PipelineSmokePage />, { wrapper: English });

    expect(screen.getByRole('status')).toHaveTextContent('0');

    await user.click(
      screen.getByRole('button', { name: enUS.pipelineSmoke.increment }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('1');

    await user.click(
      screen.getByRole('button', { name: enUS.pipelineSmoke.increment }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('renders its title and description in the active language', () => {
    render(<PipelineSmokePage />, { wrapper: Chinese });

    expect(
      screen.getByRole('heading', { name: zhCN.pipelineSmoke.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(zhCN.pipelineSmoke.description),
    ).toBeInTheDocument();
  });
});
