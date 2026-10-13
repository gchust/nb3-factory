import { Home, LifeBuoy, Settings } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
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
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
  {
    // The service desk: the ticket list, the form that raises one, and a record's own page with the dialogs that
    // move it through its states. `authz: 'skip'` on all of them: the server decides what a caller may see and do
    // from the application's own role table and the lifecycle's guards, which page grants cannot express.
    name: 'service-desk',
    navigation: { title: 'navigation.serviceDesk', icon: LifeBuoy },
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/index.js'),
        name: 'tickets',
        navigation: { title: 'navigation.tickets' },
        path: '/tickets',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/tickets/new.js'),
            name: 'ticket-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/tickets/detail/index.js'),
            name: 'ticket-detail',
            path: ':ticketId',
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/tickets/detail/assign.js'),
                name: 'ticket-assign',
                path: 'assign',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/tickets/detail/reassign.js'),
                name: 'ticket-reassign',
                path: 'reassign',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/tickets/detail/resolve.js'),
                name: 'ticket-resolve',
                path: 'resolve',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/tickets/detail/return.js'),
                name: 'ticket-return',
                path: 'return',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/tickets/detail/cancel.js'),
                name: 'ticket-cancel',
                path: 'cancel',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // An ordinary page in the sidebar, not a separate settings area: it configures the application's own role table.
    name: 'settings',
    navigation: { title: 'navigation.settings', icon: Settings },
    children: [
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-desk-settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/settings/service-desk/index.js'),
        name: 'service-desk-settings',
        navigation: { title: 'navigation.serviceDeskSettings' },
        path: '/settings/service-desk',
      },
    ],
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
