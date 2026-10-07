import { Home, Wrench } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/**
 * The ticket drawer and the completion dialog stacked on it.
 *
 * They are child routes so that what is on screen is decided by the URL: a link
 * to one ticket opens it over the list, the back button closes it, and the
 * completion form opens without replacing the ticket it belongs to.
 */
function itTicketDetailRoutes(): AppClientRouteDefinition[] {
  return [
    {
      // /it-tickets/:ticketId: the detail drawer.
      name: 'it-tickets-detail',
      path: ':ticketId',
      // Nested pages inherit the page check of `it-tickets` and must not
      // repeat it: the drawer is only reachable through the page that was
      // already authorized.
      authz: 'skip',
      componentLoader: () => import('./pages/it-tickets/detail/index.js'),
      children: [
        {
          // /it-tickets/:ticketId/complete: the resolution form, stacked on
          // the drawer.
          name: 'it-tickets-detail-complete',
          path: 'complete',
          authz: 'skip',
          componentLoader: () =>
            import('./pages/it-tickets/detail/complete-dialog.js'),
        },
      ],
    },
  ];
}

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
    name: 'it-tickets',
    path: '/it-tickets',
    auth: 'required',
    // Reporting a repair is a business page, so it checks the page grant the
    // employee and handler Permission Sets hold. The id is stored in those
    // grants: changing it is a data change, not a refactor.
    authz: { resource: { type: 'page', id: 'itTickets' }, action: 'access' },
    componentLoader: () => import('./pages/it-tickets/index.js'),
    navigation: { title: 'navigation.itTickets', icon: Wrench },
    children: [
      {
        // /it-tickets/new: the submission dialog.
        name: 'it-tickets-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/it-tickets/new.js'),
      },
      ...itTicketDetailRoutes(),
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
