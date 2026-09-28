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
    // Employees see only their own tickets and processors see all of them; the resource check
    // (`it.tickets`) is what the `it-employee` and `it-processor` permission sets grant.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'it.tickets' }, action: 'access' },
    componentLoader: () => import('./pages/it-support/index.js'),
    name: 'it-support',
    navigation: { title: 'navigation.itSupport', icon: Wrench },
    path: '/it-support',
    children: [
      {
        // Create is a child route presented as a dialog, so the list behind it stays mounted.
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/it-support/create.js'),
        name: 'it-support-create',
        path: 'new',
      },
      {
        // A record detail is URL-addressable and presented as a drawer; an employee who opens
        // somebody else's link gets the same "not found" state as a deleted ticket.
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/it-support/detail.js'),
        name: 'it-support-detail',
        path: ':ticketId',
        children: [
          {
            // Processing note before completion: a short form, so a dialog stacked on the drawer.
            auth: 'required',
            authz: 'skip',
            componentLoader: () => import('./pages/it-support/complete.js'),
            name: 'it-support-complete',
            path: 'complete',
          },
        ],
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
