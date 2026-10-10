import { FolderOpen, Home } from 'lucide-react';
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
    // A signed-in user's own project materials. The page itself needs no
    // permission beyond sign-in: the confidentiality requirement is per record,
    // so the server scopes every read and write to the caller's own ownerId and
    // refuses another user's material or file. A page grant would only hide the
    // feature from the ordinary colleagues who are meant to use it.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FolderOpen },
    path: '/materials',
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/materials/new.js'),
        name: 'material-new',
        path: 'new',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/materials/detail.js'),
        name: 'material-detail',
        path: ':materialId',
        children: [
          {
            auth: 'required',
            componentLoader: () => import('./pages/materials/detail/edit.js'),
            name: 'material-detail-edit',
            path: 'edit',
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
