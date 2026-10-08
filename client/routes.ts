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
    // The materials list stays mounted while a create form, a record or an edit
    // form covers it, so the filter and scroll position survive the round trip.
    // Every page beneath is a child of this one and declares `auth` itself:
    // routes are filtered one by one, so a child does not inherit its parent's.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FolderOpen },
    path: '/materials',
    children: [
      {
        authz: 'skip',
        auth: 'required',
        componentLoader: () => import('./pages/materials/create.js'),
        name: 'material-create',
        path: 'new',
      },
      {
        authz: 'skip',
        auth: 'required',
        componentLoader: () => import('./pages/materials/detail.js'),
        name: 'material-detail',
        path: ':materialId',
        children: [
          {
            authz: 'skip',
            auth: 'required',
            componentLoader: () => import('./pages/materials/edit.js'),
            name: 'material-edit',
            path: 'edit',
          },
        ],
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
