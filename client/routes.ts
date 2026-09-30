import { Home, LifeBuoy } from 'lucide-react';
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
    // IT support tickets: employees submit and follow their own tickets, handlers work every ticket.
    name: 'tickets',
    path: '/tickets',
    auth: 'required',
    // The page grant both IT support roles receive; the endpoints check the same page-independent business actions.
    authz: { resource: { type: 'page', id: 'it.tickets' }, action: 'access' },
    navigation: { title: 'navigation.tickets', icon: LifeBuoy },
    componentLoader: () => import('./pages/tickets/index.js'),
    children: [
      {
        // /tickets/new: submit a ticket (RouteDialog)
        name: 'ticket-new',
        path: 'new',
        componentLoader: () => import('./pages/tickets/new.js'),
      },
      {
        // /tickets/:ticketId: ticket detail and handling (RouteDrawer)
        name: 'ticket-detail',
        path: ':ticketId',
        componentLoader: () => import('./pages/tickets/detail/index.js'),
      },
    ],
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
