import { FolderKanban, Home } from 'lucide-react';
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
    // Project materials are private per owner. The page itself is open to every signed-in user (`authz: 'skip'`),
    // and the server scopes every record and attachment to its owner, so one user never sees another's data.
    auth: 'required',
    authz: 'skip',
    breadcrumb: { title: 'navigation.materials' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FolderKanban },
    path: '/materials',
    children: [
      {
        // Covering child page: create a material at /materials/new.
        authz: 'skip',
        breadcrumb: { title: 'materials.create.title' },
        componentLoader: () => import('./pages/materials/new.js'),
        name: 'material-new',
        path: 'new',
      },
      {
        // Covering child page: view and edit one material at /materials/:materialId.
        authz: 'skip',
        breadcrumb: { title: 'materials.detail.title' },
        componentLoader: () => import('./pages/materials/detail.js'),
        name: 'material-detail',
        path: ':materialId',
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
