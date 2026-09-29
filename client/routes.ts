import { BookOpenIcon, BotIcon, Home, Settings2Icon } from 'lucide-react';
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
    // Read-only material list. Both the manager and the ordinary staff set
    // grant this page; the server still filters each response by the caller's
    // record access.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: BookOpenIcon },
    path: '/materials',
  },
  {
    // Supervisor-only maintenance. The page grant is what keeps colleagues
    // out; every write is also checked on the server.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'materials-admin' },
      action: 'access',
    },
    componentLoader: () => import('./pages/materials/admin.js'),
    name: 'materials-admin',
    navigation: { title: 'navigation.materialsAdmin', icon: Settings2Icon },
    path: '/materials-admin',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'materials-assistant' },
      action: 'access',
    },
    componentLoader: () => import('./pages/materials/assistant.js'),
    name: 'materials-assistant',
    navigation: { title: 'navigation.materialsAssistant', icon: BotIcon },
    path: '/materials-assistant',
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
