import { BellIcon, ClipboardListIcon, Home } from 'lucide-react';
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
  {
    // The service-request acceptance screen. Declaring no `authz` makes the
    // route name its own page resource, which the `service-request-user`
    // permission set in database/main/seeds grants access to.
    auth: 'required',
    componentLoader: () => import('./pages/service-requests/index.js'),
    name: 'service-requests',
    navigation: {
      title: 'navigation.serviceRequests',
      icon: ClipboardListIcon,
    },
    path: '/service-requests',
    children: [
      {
        // The detail drawer, and the destination an acceptance notification's
        // Open link points at. A child route adds no page check of its own.
        name: 'service-request-detail',
        path: ':serviceRequestId',
        componentLoader: () => import('./pages/service-requests/detail.js'),
      },
    ],
  },
  {
    // The authenticated production surface that mounts the in-app inbox. The
    // plugin also ships a development-only `/dev/notification-in-app` page;
    // that one is a build artifact, this is the message center users get.
    auth: 'required',
    componentLoader: () => import('./pages/messages.js'),
    name: 'messages',
    navigation: { title: 'navigation.messages', icon: BellIcon },
    path: '/messages',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
