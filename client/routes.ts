import { ClipboardList, Home } from 'lucide-react';
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
    // The front-desk register. Any signed-in member of staff may use it, so
    // it opts out of page authorization rather than inventing a grant.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/visitors/index.js'),
    name: 'visitors',
    navigation: { title: 'navigation.visitors', icon: ClipboardList },
    path: '/visitors',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/visitors/new.js'),
        name: 'visitors-new',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/visitors/checkout.js'),
        name: 'visitors-checkout',
        path: ':visitorId/checkout',
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
