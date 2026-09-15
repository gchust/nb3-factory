import { BarChart3, Home, Ticket } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/tickets.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: Ticket },
    path: '/tickets',
  },
  {
    // A seatbelt page: only signed-in users with `page:ticket-detail` access may
    // open it, and it is not a menu target because its path is dynamic.
    auth: 'required',
    componentLoader: () => import('./pages/ticket-detail.js'),
    name: 'ticket-detail',
    path: '/tickets/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/ticket-stats.js'),
    name: 'stats',
    navigation: { title: 'navigation.stats', icon: BarChart3 },
    path: '/stats',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
