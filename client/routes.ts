import { CalendarClock, Home, ListTodo } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
  },
  {
    // The scaffold the scheduled "检查过期待办" task acts on: three seeded rows and an `expired` column only the
    // schedule writes. Read-mostly, so it carries no create flow.
    authz: { resource: { type: 'page', id: 'todos' }, action: 'access' },
    auth: 'required',
    componentLoader: () => import('./pages/todos/index.js'),
    name: 'todos',
    navigation: { title: 'navigation.todos', icon: ListTodo },
    path: '/todos',
  },
  {
    // The application's own view of the Scheduler plugin's schedules, since the plugin contributes no page. Guarded
    // by the same page grant the plugin's routes require, so enabling a schedule here matches what the API allows.
    authz: {
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    },
    auth: 'required',
    componentLoader: () => import('./pages/schedules/index.js'),
    name: 'schedules',
    navigation: { title: 'navigation.schedules', icon: CalendarClock },
    path: '/schedules',
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
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
