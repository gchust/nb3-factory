import { Home, Receipt } from 'lucide-react';
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
    // The page grant these pages are checked against. The literal is duplicated, not imported: the client never runs
    // server code, and the seed (`database/main/seeds/202610010011_expense_departments.ts`) states the same id.
    // Changing one without the other silently locks every non-root user out of the feature.
    authz: {
      resource: { type: 'page', id: 'expenses.claims' },
      action: 'access',
    },
    auth: 'required',
    componentLoader: () => import('./pages/expenses/index.js'),
    name: 'expenses',
    navigation: { title: 'navigation.expenses', icon: Receipt },
    path: '/expenses',
    children: [
      {
        // A covering child page: the editor renders `RouteChildPage`, so it takes the whole content area while the
        // list stays mounted underneath and the browser's Back returns to the list with its filters intact.
        componentLoader: () => import('./pages/expenses/new.js'),
        name: 'expenses-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/expenses/detail.js'),
        name: 'expenses-detail',
        path: ':claimId',
      },
      {
        // Static first, dynamic second: React Router ranks a static segment above a parameter, so `/expenses/edit/1`
        // matches this child rather than `:claimId`.
        componentLoader: () => import('./pages/expenses/edit.js'),
        name: 'expenses-edit',
        path: 'edit/:claimId',
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
