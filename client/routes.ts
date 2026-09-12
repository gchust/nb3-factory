import { FileText, Home } from 'lucide-react';
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
    name: 'contracts',
    path: '/contracts',
    auth: 'required',
    navigation: { title: 'navigation.contracts', icon: FileText },
    componentLoader: () => import('./pages/contracts/index.js'),
  },
  {
    name: 'contracts.new',
    path: '/contracts/new',
    auth: 'required',
    componentLoader: () => import('./pages/contracts/new.js'),
  },
  {
    name: 'contracts.detail',
    path: '/contracts/:id',
    auth: 'required',
    componentLoader: () => import('./pages/contracts/detail.js'),
  },
  {
    name: 'contracts.edit',
    path: '/contracts/:id/edit',
    auth: 'required',
    componentLoader: () => import('./pages/contracts/edit.js'),
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
