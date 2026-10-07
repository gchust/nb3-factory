import { Bell, FolderKanban, Home } from 'lucide-react';
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
    // Access to a project is membership, checked by the server on every request, so the page itself takes part in no
    // page authorization. A page grant would have to be kept in step with the membership rows it duplicates.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/projects/index.js'),
    name: 'projects',
    navigation: { title: 'navigation.projects', icon: FolderKanban },
    path: '/projects',
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/projects/new.js'),
        name: 'projects.new',
        path: 'new',
      },
    ],
  },
  {
    // A sibling of `/projects` rather than its child: the detail replaces the list instead of rendering below it.
    // React Router ranks the static `new` above this dynamic segment, so `/projects/new` still opens the form.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/projects/detail/index.js'),
    name: 'project-detail',
    path: '/projects/:projectId',
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/projects/detail/task.js'),
        name: 'project-task',
        path: 'tasks/:taskId',
      },
    ],
  },
  {
    // Every signed-in user has their own inbox; the server scopes reads and writes to the session user, so the page
    // needs no page grant of its own. This is where the daily overdue-task reminders surface.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/notifications.js'),
    name: 'notifications',
    navigation: { title: 'navigation.notifications', icon: Bell },
    path: '/notifications',
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
