import {
  ClientApplicationContext,
  realtimeClientToken,
  toasterToken,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
  useAuthentication,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { reactProviders } from '@nocobase/app-plugin-authorization/client/react-providers';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Outlet } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRouter } from '../../client/routing/app-router.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../client/components/ui/dialog.js';
import enUS from '../../client/locales/en-US.js';

const AuthorizationProvider = reactProviders[0].component;
vi.mock('../../client/layouts/app-layout.js', () => ({
  AppLayout: () => <Outlet />,
}));
vi.mock('../../client/routing/standalone-page-layout.js', () => ({
  StandalonePageLayout: () => <Outlet />,
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: 'test', resources: enUS },
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const allowed = {
    data: {
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'probe' }, actions: ['access'] },
      ],
    },
  };
  const request = vi.fn().mockResolvedValue(allowed);
  const authz = new AuthorizationClient({ request } as never);
  const services = new ServiceContainer();
  const listeners = new Set<() => void>();
  const realtime = {
    active: true,
    reconnect: vi.fn(),
    onOpen: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  let session: unknown = { user: { id: 'user' }, session: { id: 'session' } };
  const getSession = vi.fn(async () => ({ data: session }));
  const toaster = { show: vi.fn(), close: vi.fn() };
  services.instance(authenticationClientToken, {
    getSession,
    signOut: vi.fn(),
  } as never);
  services.instance(realtimeClientToken, realtime as never);
  services.instance(authorizationClientToken, authz);
  services.instance(toasterToken, toaster);
  const mounted = vi.fn();
  const cleaned = vi.fn();
  const accepted = vi.fn();
  const old = Promise.withResolvers<void>();
  function Page() {
    useEffect(() => {
      let active = true;
      mounted();
      void old.promise.then(() => {
        if (active) accepted();
      });
      return () => {
        active = false;
        cleaned();
      };
    }, []);
    return (
      <Dialog open>
        <DialogContent>
          <DialogTitle>Protected dialog</DialogTitle>
          <DialogDescription>Protected content</DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }
  let refresh!: () => Promise<void>;
  function Capture() {
    refresh = useAuthentication().refresh;
    return null;
  }
  const route = {
    id: 'probe',
    name: 'probe',
    path: '/',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'probe' }, action: 'access' },
    packageName: 'test',
    source: 'application',
    componentLoader: async () => ({ default: Page }),
  } as const;
  render(
    <TestI18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider
        value={{ services } as unknown as ClientApplication}
      >
        <AuthenticationProvider>
          <Capture />
          <AuthorizationProvider>
            <MemoryRouter>
              <AppRouter
                clientRoutes={[
                  route,
                  {
                    id: 'login',
                    name: 'login',
                    path: '/login',
                    auth: 'guest',
                    authz: 'skip',
                    source: 'application',
                    packageName: 'test',
                    componentLoader: async () => ({
                      default: () => <p>Login route</p>,
                    }),
                  },
                ]}
              />
            </MemoryRouter>
          </AuthorizationProvider>
        </AuthenticationProvider>
      </ClientApplicationContext.Provider>
    </TestI18nProvider>,
  );
  await act(async () => {});
  // Register after preparation to prove ordering does not depend on effects.
  listeners.add(() => authz.invalidate());
  return {
    allowed,
    request,
    authz,
    realtime,
    toaster,
    getSession,
    mounted,
    cleaned,
    accepted,
    old,
    open: async () => {
      await act(async () => {
        for (const listener of listeners) listener();
      });
    },
    logout: async () => {
      session = null;
      await act(async () => refresh());
    },
  };
}

it('mounts only after the initial handshake and preserves runtime fail-closed portal cleanup', async () => {
  const probe = await setup();
  expect(probe.mounted).not.toHaveBeenCalled();
  expect(probe.request).not.toHaveBeenCalled();
  await probe.open();
  await screen.findByText('Protected dialog');
  expect(probe.mounted).toHaveBeenCalledOnce();
  expect(probe.request).toHaveBeenCalledOnce();
  const next = Promise.withResolvers<typeof probe.allowed>();
  probe.request.mockReturnValueOnce(next.promise);
  await probe.open();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(probe.cleaned).toHaveBeenCalledOnce();
  await act(async () => probe.old.resolve());
  expect(probe.accepted).not.toHaveBeenCalled();
  await act(async () =>
    next.resolve({ data: { unrestricted: false, permissions: [] } }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(await screen.findByText('Access denied')).toBeVisible();
});

it('mounts with a warning when realtime cannot open, and retries from the warning', async () => {
  vi.useFakeTimers();
  const probe = await setup();
  await act(async () => vi.advanceTimersByTime(10_000));
  await act(async () => {});
  expect(screen.getByText('Protected dialog')).toBeVisible();
  expect(probe.mounted).toHaveBeenCalledOnce();
  expect(probe.toaster.show).toHaveBeenCalledOnce();
  const warning = probe.toaster.show.mock.calls[0][0] as {
    id: string;
    type: string;
    title: string;
    duration: number;
    action: { onClick: () => void };
  };
  expect(warning).toMatchObject({
    type: 'warning',
    title: 'Realtime updates are unavailable',
    duration: 0,
  });
  await act(async () => warning.action.onClick());
  expect(probe.toaster.close).toHaveBeenCalledWith(warning.id);
  expect(probe.realtime.reconnect).toHaveBeenCalledTimes(2);
});
