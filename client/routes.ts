import { BookOpen, Home } from 'lucide-react';
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
    name: 'materials',
    path: '/materials',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    navigation: { title: 'materials.title', icon: BookOpen },
    componentLoader: () => import('./pages/materials/index.js'),
    children: [
      {
        name: 'material-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/materials/new.js'),
      },
      {
        name: 'material-edit',
        path: 'edit/:materialId',
        authz: 'skip',
        componentLoader: () => import('./pages/materials/edit.js'),
      },
      {
        name: 'material-detail',
        path: ':materialId',
        authz: 'skip',
        componentLoader: () => import('./pages/materials/detail/index.js'),
        children: [
          {
            name: 'material-detail-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () => import('./pages/materials/edit.js'),
          },
        ],
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
