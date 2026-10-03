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
    // Project materials are private to the signed-in user. The page itself is reachable by every authenticated user
    // (`authz: 'skip'`, UI gating only); the server enforces ownership on every materials and attachment request, so a
    // colleague opening a shared link still cannot read the content.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FolderOpen },
    path: '/materials',
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/materials/new.js'),
    name: 'material-new',
    path: '/materials/new',
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/materials/detail.js'),
    name: 'material-detail',
    path: '/materials/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
