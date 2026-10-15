import { LayoutDashboard, Ticket } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * The page grant the service desk permission sets carry (`database/main/seeds/202611010002_service_desk_permission_sets.ts`).
 * Declaring it on the first page of each path is what puts the page in the sidebar for the sets that hold it; root
 * bypasses it. The endpoints behind these pages enforce their own authorization independently.
 */
const SERVICE_DESK_PAGE = {
  resource: { type: 'page', id: 'service-desk' },
  action: 'access',
} as const;

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land. The overview itself is the service desk
    // dashboard: counts, engineers' workload and the tickets that need attention, loaded from an endpoint that scopes
    // what each role may see. A ticket opened from here stays over the landing page (I9), so the same drawer module
    // is declared as a child route and the page provides the outlet context it reloads through.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    path: '/',
    children: [
      {
        componentLoader: () => import('./pages/tickets/detail/index.js'),
        name: 'home-ticket',
        path: ':ticketId',
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
    // The ticket list. `new` and `:ticketId` are child routes so the create dialog and the detail drawer are
    // URL-addressable and stack over the list with its search and filters intact.
    auth: 'required',
    authz: SERVICE_DESK_PAGE,
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: Ticket },
    path: '/tickets',
    children: [
      {
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'ticket-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/tickets/detail/index.js'),
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
