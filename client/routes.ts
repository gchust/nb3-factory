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
    // Project materials: each signed-in user keeps their own records and their
    // private attachments. Page authorization is skipped because ownership is
    // not a page grant — the endpoints filter every row by the caller. See
    // `server/routes/project-materials.ts`.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/project-materials/index.js'),
    name: 'project-materials',
    navigation: {
      title: 'navigation.projectMaterials',
      icon: FolderKanban,
    },
    path: '/project-materials',
    children: [
      {
        name: 'project-material-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/project-materials/new.js'),
      },
      {
        name: 'project-material-detail',
        path: ':materialId',
        authz: 'skip',
        componentLoader: () =>
          import('./pages/project-materials/detail/index.js'),
        children: [
          {
            name: 'project-material-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/project-materials/detail/edit.js'),
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
