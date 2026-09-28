import { FlaskConical, Home } from 'lucide-react';
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

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    // A top-level settings entry. It stays a root entry rather than appending to the notification plugin's own group
    // so this contribution resolves on its own; the page still links to that group's logs page. The test destination
    // and one-channel selection are pinned by the page, and the endpoints it calls enforce their own session and
    // `notification:test send` permission independently.
    authz: {
      resource: { type: 'page', id: 'notification.test' },
      action: 'access',
    },
    componentLoader: () => import('./pages/notification-test/index.js'),
    name: 'notification-test',
    navigation: {
      title: 'navigation.notificationTest',
      icon: FlaskConical,
    },
    path: '/notification-test',
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
