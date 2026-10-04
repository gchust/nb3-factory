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
    // The IT repair workspace. Every signed-in user reaches the landing page, but this one is a page grant: an
    // administrator gives a colleague `tickets-employee` or `tickets-handler` before the menu entry appears.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: Wrench },
    path: '/tickets',
  },
  {
    // The direct address of one ticket. It is a page of its own rather than a child of the list so that opening a
    // link — including one an employee must not read — resolves here, where the server decides what to return.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
    componentLoader: () => import('./pages/tickets/detail.js'),
    name: 'ticket-detail',
    path: '/tickets/:ticketId',
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
