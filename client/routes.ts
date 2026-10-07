import { FileStack, Home } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/**
 * The project-materials pages under one URL alias.
 *
 * The canonical `/project-materials` carries the menu entry; `/materials` and `/projectMaterials`
 * are aliases so a link written either way reaches the same pages instead of the landing page.
 * Every alias needs unique route names, hence `namePrefix`, and only the canonical tree declares
 * `navigation`, so the menu lists the feature once.
 */
function materialRoutes(
  path: string,
  namePrefix: string,
  withNavigation: boolean,
): AppClientRouteDefinition[] {
  return [
    {
      name: `${namePrefix}-list`,
      path,
      auth: 'required',
      // Every signed-in user manages their own materials. Ownership, enforced by the server on
      // every read and write, is what isolates one user's materials from another's, so this page
      // needs no page grant an administrator would have to remember to hand out.
      authz: 'skip',
      ...(withNavigation
        ? {
            navigation: {
              title: 'navigation.projectMaterials',
              icon: FileStack,
            },
          }
        : {}),
      componentLoader: () => import('./pages/project-materials/index.js'),
      children: [
        {
          name: `${namePrefix}-new`,
          path: 'new',
          authz: 'skip',
          componentLoader: () => import('./pages/project-materials/new.js'),
        },
        {
          name: `${namePrefix}-detail`,
          path: ':id',
          authz: 'skip',
          componentLoader: () => import('./pages/project-materials/detail.js'),
        },
      ],
    },
  ];
}

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
  ...materialRoutes('/project-materials', 'project-materials', true),
  ...materialRoutes('/materials', 'materials', false),
  ...materialRoutes('/projectMaterials', 'project-materials-camel', false),
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
