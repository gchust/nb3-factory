import {
  Home,
  Inbox,
  Ticket as TicketIcon,
  Users as UsersIcon,
} from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // The dashboard is the landing page for every signed-in user. `authz: 'skip'` keeps it reachable whatever page
    // grants exist, so no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // The repair-ticket list. The create dialog is a child route, so `/tickets/new` opens over the list and closing
    // returns to it. What each caller sees is scoped by the API.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: TicketIcon },
    path: '/tickets',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'tickets-new',
        path: 'new',
      },
    ],
  },
  {
    // One ticket's own page, a sibling of the list so it replaces the list rather than rendering inside it. Its
    // action dialogs are children, so `/tickets/12/resolve` opens over the ticket and closing returns to it.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/tickets/detail.js'),
    name: 'tickets-detail',
    path: '/tickets/:ticketId',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/transition-dialog.js'),
        name: 'tickets-assign',
        path: 'assign',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/transition-dialog.js'),
        name: 'tickets-reassign',
        path: 'reassign',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/transition-dialog.js'),
        name: 'tickets-progress',
        path: 'progress',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/transition-dialog.js'),
        name: 'tickets-resolve',
        path: 'resolve',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/transition-dialog.js'),
        name: 'tickets-return',
        path: 'return',
      },
    ],
  },
  {
    // The in-app inbox, where the notifications a ticket change sends are read. It declares navigation here because
    // the shell's header carries no inbox entry.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    navigation: { title: 'navigation.inbox', icon: Inbox },
    path: '/inbox',
  },
  {
    // Root only: the page grant `it-team` is seeded for nobody but root, whose access is unrestricted, so the
    // navigation entry is hidden from everyone else and the page itself refuses them.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'it-team' }, action: 'access' },
    componentLoader: () => import('./pages/team/index.js'),
    name: 'team',
    navigation: { title: 'navigation.team', icon: UsersIcon },
    path: '/team',
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
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
