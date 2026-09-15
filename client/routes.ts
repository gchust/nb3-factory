import { BarChart3, FileText, Home } from 'lucide-react';
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
    componentLoader: () => import('./pages/contracts-list.js'),
    name: 'contracts',
    navigation: { title: 'contracts.nav.ledger', icon: FileText },
    path: '/contracts',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/contracts-stats.js'),
    name: 'contractsStats',
    navigation: { title: 'contracts.nav.stats', icon: BarChart3 },
    path: '/contracts/stats',
  },
  // Detail and form pages are reachable but are not menu entries.
  {
    auth: 'required',
    componentLoader: () => import('./pages/contracts-form.js'),
    name: 'contractsNew',
    path: '/contracts/new',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/contracts-form.js'),
    name: 'contractsEdit',
    path: '/contracts/:id/edit',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/contracts-detail.js'),
    name: 'contractsDetail',
    path: '/contracts/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
