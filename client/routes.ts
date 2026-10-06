import { Home, Wrench } from 'lucide-react';
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
    // Employees and handlers both open this page; the record scope their grant carries decides which tickets they see.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'repair-tickets' },
      action: 'access',
    },
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: Wrench },
    path: '/tickets',
    children: [
      {
        // The detail drawer. It inherits the page's check (`skip` means it adds none of its own); the server still
        // decides record visibility, so a direct link to somebody else's ticket answers not-found.
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/detail.js'),
        name: 'ticket-detail',
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
