// The materials page as each identity uses it: a reader only reads, a contributor keeps their own material, and an
// administrator opens one draft to a chosen reader and revokes it again. The API is answered in process, so the test
// exercises the page's own behavior rather than the server (which `tests/server/materials.test.ts` covers).
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import MaterialsPage from '../../client/pages/materials/index.js';
import enUS from '../../client/locales/en-US.js';

const namespace = 'nb3-factory';
const namespaces = {
  [namespace]: { 'en-US': async () => ({ default: enUS }) },
};

const material = (
  id: string,
  overrides: Partial<{
    title: string;
    body: string | null;
    ownerId: string;
    ownerName: string | null;
    published: boolean;
    confidential: boolean;
  }> = {},
) => ({
  id,
  title: `Material ${id}`,
  body: `Body of ${id}`,
  ownerId: 'materials-user-jia',
  ownerName: 'Jia',
  published: false,
  confidential: false,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...overrides,
});

const render = (handler: (call: { method: string; path: string }) => unknown) =>
  renderWithApp(<MaterialsPage />, {
    namespace,
    namespaces,
    fetch: answerApi(handler as never),
  });

describe('materials page', () => {
  it('lets a reader read published material without offering any write action', async () => {
    const user = userEvent.setup();
    const published = material('materials-material-p', {
      title: 'Public P',
      published: true,
    });
    await render(({ path }) =>
      path === 'materials/capabilities'
        ? { data: { create: false, edit: false, delete: false, share: false } }
        : { data: [published] },
    );

    expect(await screen.findByText('Public P')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS.materials.create }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.materials.edit }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Public P' }));
    const detail = await screen.findByTestId('material-detail');
    expect(
      within(detail).getByText('Body of materials-material-p'),
    ).toBeVisible();
    expect(
      within(detail).queryByTestId('material-shares'),
    ).not.toBeInTheDocument();
  });

  it('lets a contributor create a material and keeps the owner from the server', async () => {
    const user = userEvent.setup();
    const created = material('materials-new', {
      title: 'New draft',
      published: false,
    });
    const list = [material('materials-material-p', { published: true })];
    await render(({ method, path, json }) => {
      if (path === 'materials/capabilities')
        return {
          data: { create: true, edit: true, delete: true, share: false },
        };
      if (method === 'POST') {
        expect(json).toMatchObject({
          title: 'New draft',
          body: 'Draft body',
          published: false,
          confidential: false,
        });
        list.push(created);
        return { data: created };
      }
      return { data: list };
    });

    await user.click(
      await screen.findByRole('button', { name: enUS.materials.create }),
    );
    const form = await screen.findByTestId('material-form');
    await user.type(
      within(form).getByLabelText(enUS.materials.title),
      'New draft',
    );
    await user.type(
      within(form).getByLabelText(enUS.materials.body),
      'Draft body',
    );
    await user.click(
      within(form).getByRole('button', { name: enUS.materials.save }),
    );

    expect(await screen.findByText('New draft')).toBeVisible();
  });

  it('lets an administrator open one draft to a reader and revoke it again', async () => {
    const user = userEvent.setup();
    const draft = material('materials-material-d', { title: 'Private D' });
    const share = {
      userId: 'materials-user-yi',
      name: 'Yi',
      username: 'yi',
      email: 'yi@example.com',
    };
    const revoked: string[] = [];
    await render(({ method, path }) => {
      if (path === 'materials/capabilities')
        return {
          data: { create: true, edit: true, delete: true, share: true },
        };
      if (path === 'materials') return { data: [draft] };
      if (path.endsWith('/shares') && method === 'GET')
        return { data: revoked.length ? [] : [share] };
      if (path.endsWith('/shareTargets'))
        return { data: revoked.length ? [] : [share] };
      if (method === 'DELETE') {
        revoked.push(path);
        return new Response(null, { status: 204 });
      }
      return { data: draft };
    });

    await user.click(await screen.findByRole('button', { name: 'Private D' }));
    const panel = await screen.findByTestId('material-shares');
    expect(within(panel).getByText('Yi')).toBeVisible();

    await user.click(within(panel).getByTestId('material-share-revoke'));
    await waitFor(() =>
      expect(revoked).toEqual([
        'materials/materials-material-d/shares/materials-user-yi',
      ]),
    );
    expect(
      await within(panel).findByText(enUS.materials.noShares),
    ).toBeVisible();
  });
});
