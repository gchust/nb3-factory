import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { LayoutDashboard, LifeBuoy, Ticket, Users } from 'lucide-react';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // The service desk's landing page: the work waiting today, for whoever signed in. `authz: 'skip'` is deliberate —
    // the dashboard narrows its own content to what the caller's role may see, and page authorization would only add a
    // grant nobody has to hand out.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/dashboard/index.js'),
    name: 'home',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    path: '/',
    children: [
      {
        // The dashboard lists tickets, so a ticket opens over the dashboard rather than sending the reader to the
        // list. It is a route of its own (`/ticket/:ticketId`) because the list already owns `/tickets/:ticketId`;
        // both render the same drawer module.
        authz: 'skip',
        auth: 'required',
        componentLoader: () => import('./pages/tickets/detail.js'),
        name: 'dashboard-ticket',
        path: 'ticket/:ticketId',
      },
    ],
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
    // The service desk's own pages, grouped in the menu. A group has no path of its own, so its children name theirs
    // in full.
    name: 'service-desk',
    navigation: { title: 'navigation.serviceDesk', icon: LifeBuoy },
    children: [
      {
        // The list is scoped by the server to the tickets the caller may see: their own, the ones assigned to them, or
        // all of them for the service desk.
        authz: 'skip',
        auth: 'required',
        componentLoader: () => import('./pages/tickets/index.js'),
        name: 'tickets',
        navigation: { title: 'navigation.tickets', icon: Ticket },
        path: 'tickets',
        children: [
          {
            // Opened from the list's primary action, over the list. No navigation entry: it is a dialog, not a page.
            authz: 'skip',
            auth: 'required',
            componentLoader: () => import('./pages/tickets/new.js'),
            name: 'ticket-new',
            path: 'new',
          },
          {
            // One ticket, over the list. The menu cannot link to a record, so this declares no navigation either.
            authz: 'skip',
            auth: 'required',
            componentLoader: () => import('./pages/tickets/detail.js'),
            name: 'ticket-detail',
            path: ':ticketId',
          },
        ],
      },
      {
        authz: 'skip',
        auth: 'required',
        componentLoader: () => import('./pages/team/index.js'),
        name: 'team',
        navigation: { title: 'navigation.team', icon: Users },
        path: 'team',
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
