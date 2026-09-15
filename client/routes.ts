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
    componentLoader: () => import('./pages/documents.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: FileText },
    path: '/documents',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/document-stats.js'),
    name: 'document-stats',
    navigation: { title: 'navigation.documentStats', icon: BarChart3 },
    path: '/document-stats',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
