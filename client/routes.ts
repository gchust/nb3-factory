import { Home, ListTodo } from 'lucide-react';
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
    // A personal list every signed-in user reaches. `authz: 'skip'` keeps it out of page authorization; this feature
    // deliberately has no per-user permission differentiation.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/todos/index.js'),
    name: 'todos',
    navigation: { title: 'navigation.todos', icon: ListTodo },
    path: '/todos',
    children: [
      {
        // Create and edit are child routes, so the dialog has a URL and the browser Back button closes it.
        name: 'todos-new',
        path: 'new',
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/todos/new.js'),
      },
      {
        name: 'todos-edit',
        path: ':todoId/edit',
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/todos/edit.js'),
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
