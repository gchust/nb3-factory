import { Home, LifeBuoy } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import { IT_TICKETS_PAGE } from './pages/it-requests/types.js';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    // The first page of the path owns the page grant; the child overlays skip
    // their own check but stay behind this one.
    authz: {
      resource: { type: 'page', id: IT_TICKETS_PAGE },
      action: 'access',
    },
    componentLoader: () => import('./pages/it-requests/index.js'),
    name: 'it-requests',
    navigation: { title: 'navigation.itRequests', icon: LifeBuoy },
    path: '/it/requests',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/it-requests/new.js'),
        name: 'it-request-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/it-requests/detail/index.js'),
        name: 'it-request-detail',
        path: ':ticketId',
      },
    ],
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
