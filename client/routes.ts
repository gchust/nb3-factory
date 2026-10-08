import { FileText, Home, MessageSquareText } from 'lucide-react';
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
    // The library itself. Both permission sets are granted `access`; the page only caps it at what the endpoint would
    // return anyway, so a colleague can read the materials they are allowed to and see no others.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'materials.navigation', icon: FileText },
    path: '/materials',
    children: [
      {
        // A dialog is a route so the browser's back button and a deep link both work.
        name: 'materials-new',
        path: 'new',
        componentLoader: () => import('./pages/materials/new.js'),
      },
      {
        // Read-only, and the only way a colleague opens a material.
        name: 'materials-detail',
        path: ':materialId',
        componentLoader: () => import('./pages/materials/detail.js'),
      },
      {
        // The supervisor's edit dialog, opened from a row.
        name: 'materials-edit',
        path: ':materialId/edit',
        componentLoader: () => import('./pages/materials/edit.js'),
      },
    ],
  },
  {
    // The assistant answers nothing by itself: it hands the question to the `materials-assistant` employee, which reads
    // materials through the same authorization the page uses. `authz: 'skip'` keeps it reachable for every signed-in
    // user; the assistant always answers from the asker's own permissions.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/assistant/index.js'),
    name: 'assistant',
    navigation: { title: 'assistant.navigation', icon: MessageSquareText },
    path: '/assistant',
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
