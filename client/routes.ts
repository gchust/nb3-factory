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
  {
    // The simplified acceptance scenario has no role split, so both pages are
    // reachable by every signed-in user and opt out of page grants.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/service-requests/index.js'),
    name: 'service-requests',
    navigation: { title: 'navigation.serviceRequests', icon: ClipboardList },
    path: '/service-requests',
  },
  {
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/service-requests/detail.js'),
    name: 'service-request-detail',
    path: '/service-requests/:id',
  },
  {
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/messages/index.js'),
    name: 'messages',
    navigation: { title: 'navigation.messages', icon: Bell },
    path: '/messages',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
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
