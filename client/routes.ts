import { Bell, ClipboardList, Home } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

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
  // The service-request flow is a small build test with two accounts: a
  // supervisor creates and accepts requests, and the assignee opens the
  // request from the in-app message. No per-role page grant is defined, so
  // these pages declare `authz: 'skip'` for any signed-in user rather than a
  // page id that the assignee would need a grant for.
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/service-requests/index.js'),
    name: 'service-requests',
    navigation: { title: 'navigation.serviceRequests', icon: ClipboardList },
    path: '/service-requests',
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/service-requests/detail.js'),
    name: 'service-request-detail',
    path: '/service-requests/:id',
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/service-requests/messages.js'),
    name: 'messages',
    navigation: { title: 'navigation.messages', icon: Bell },
    path: '/messages',
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
