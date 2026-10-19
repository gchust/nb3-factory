import { HeadsetIcon, Home, UsersRoundIcon } from 'lucide-react';
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
    // IT service desk. The list page owns the dashboard and the ticket table;
    // both the create form and a ticket's details are child overlays, so the
    // list stays mounted behind them.
    name: 'it-tickets',
    path: '/it-tickets',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'it.tickets' }, action: 'access' },
    navigation: { title: 'navigation.itTickets', icon: HeadsetIcon },
    componentLoader: () => import('./pages/it-tickets/index.js'),
    children: [
      {
        name: 'it-ticket-new',
        path: 'new',
        componentLoader: () => import('./pages/it-tickets/new.js'),
      },
      {
        name: 'it-ticket-detail',
        path: ':ticketId',
        componentLoader: () => import('./pages/it-tickets/detail.js'),
      },
    ],
  },
  {
    // Service desk administration: the team roster, permission-set assignment
    // and the demonstration data. The page grant is held by the service desk
    // set; root administrators reach it without an assignment.
    name: 'it-team',
    path: '/it-team',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'it.team' }, action: 'access' },
    navigation: { title: 'navigation.itTeam', icon: UsersRoundIcon },
    componentLoader: () => import('./pages/it-team/index.js'),
    children: [
      {
        name: 'it-team-member-new',
        path: 'new',
        componentLoader: () => import('./pages/it-team/new.js'),
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
