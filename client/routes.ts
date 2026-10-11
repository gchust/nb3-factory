import { Home, LaptopIcon } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
  {
    // The device ledger (issue #701): one shared list of devices with their code, name and status. `authz: 'skip'`
    // keeps it reachable by every signed-in user, like the landing page; the endpoints still require a session.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/devices/index.js'),
    name: 'devices',
    navigation: { title: 'navigation.devices', icon: LaptopIcon },
    path: '/devices',
    children: [
      {
        // The create dialog, opened from the list's header or its empty state and rendered in the list's <Outlet>.
        componentLoader: () => import('./pages/devices/new.js'),
        name: 'devices-new',
        path: 'new',
      },
      {
        // A row's edit dialog, opened alone over the list; closing returns to the same filtered list.
        componentLoader: () => import('./pages/devices/edit.js'),
        name: 'devices-edit',
        path: 'edit/:deviceId',
      },
    ],
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
