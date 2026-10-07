import { Bell, Home, Ticket } from 'lucide-react';
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
    // The IT service desk list. Role scoping (employee/engineer/service desk) is enforced by the `/api/helpdesk`
    // endpoints, which decide what each viewer may see, not by page authorization, so `authz` is skipped and any
    // signed-in user may open the page.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: Ticket },
    path: '/tickets',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'tickets-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/detail.js'),
        name: 'tickets-detail',
        path: ':ticketId',
      },
    ],
  },
  {
    // The production message center. The notification-in-app plugin contributes the inbox but
    // only a development route that mounts it; a production build has no page, and its Skill
    // forbids exposing the dev route in production, so the application owns this one.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/notifications/index.js'),
    name: 'notifications',
    navigation: { title: 'navigation.notifications', icon: Bell },
    path: '/notifications',
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
