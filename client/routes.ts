import { ClipboardListIcon, Home, WorkflowIcon } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import systemSettingsRoutes from './pages/settings/routes.js';

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
    // The IT service desk. The parent is the one page a caller needs to reach the section at all; each child declares
    // its own page grant, so a permission set can allow reporting without allowing the list, or the other way round.
    name: 'tickets',
    path: '/tickets',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'tickets.list' }, action: 'access' },
    navigation: {
      title: 'tickets.title',
      icon: ClipboardListIcon,
      order: 20,
    },
    breadcrumb: { title: 'tickets.title' },
    componentLoader: () => import('./pages/tickets/index.js'),
    children: [
      {
        name: 'ticketNew',
        path: 'new',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'tickets.new' },
          action: 'access',
        },
        breadcrumb: { title: 'tickets.new' },
        componentLoader: () => import('./pages/tickets/new.js'),
      },
      {
        name: 'ticketDetail',
        path: ':ticketId',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'tickets.detail' },
          action: 'access',
        },
        breadcrumb: { title: 'tickets.detail.title' },
        componentLoader: () => import('./pages/tickets/detail.js'),
      },
    ],
  },
  {
    // The process administration: the diagram the runtime enforces, its parameters, and every recorded transition.
    name: 'serviceDesk',
    path: '/service-desk',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'service-desk' }, action: 'access' },
    navigation: {
      title: 'tickets.serviceDesk.navigation',
      icon: WorkflowIcon,
      order: 30,
    },
    breadcrumb: { title: 'tickets.serviceDesk.navigation' },
    componentLoader: () => import('./pages/service-desk/index.js'),
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

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  systemSettingsRoutes,
];

export default routes;
