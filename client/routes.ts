import { Home, MonitorSmartphone } from 'lucide-react';
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
    // The device ledger: view, add, edit and filter devices. It sits in the sidebar like any other page and is
    // reachable by every signed-in user, so it needs no page grant (`authz: 'skip'`); the endpoints still require a
    // session of their own. The create and edit dialogs are child routes so they open over the list and survive a
    // refresh.
    name: 'devices',
    path: '/devices',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.devices', icon: MonitorSmartphone },
    componentLoader: () => import('./pages/devices/index.js'),
    children: [
      {
        // /devices/new: create dialog (RouteDialog)
        name: 'device-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/devices/new.js'),
      },
      {
        // /devices/edit/:deviceId: edit dialog opened from a row, alone over the list
        name: 'device-edit',
        path: 'edit/:deviceId',
        authz: 'skip',
        componentLoader: () => import('./pages/devices/edit.js'),
      },
    ],
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
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
