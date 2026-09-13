import { FileText, FolderOpen, Home } from 'lucide-react';
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
    componentLoader: () => import('./pages/resources.js'),
    name: 'resources',
    navigation: { title: 'navigation.resources', icon: FolderOpen },
    path: '/resources',
  },
  // The create page is declared before the detail page so the static segment wins over `:id`.
  {
    auth: 'required',
    componentLoader: () => import('./pages/resource-new.js'),
    name: 'resource-new',
    path: '/resources/new',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/resource-detail.js'),
    name: 'resource-detail',
    path: '/resources/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/files.js'),
    name: 'files',
    navigation: { title: 'navigation.files', icon: FileText },
    path: '/files',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
