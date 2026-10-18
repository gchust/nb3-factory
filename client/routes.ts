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
    // The todo list, and the page where the schedule's effect is visible: a row the sweep has reached shows
    // 已过期. `expired` is server-owned, so this page reads it and never writes it.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'todos' }, action: 'access' },
    componentLoader: () => import('./pages/todos/index.js'),
    name: 'todos',
    path: '/todos',
    navigation: { title: 'navigation.todos', icon: ListTodo },
    children: [
      {
        // The create form, a dialog opened by URL. It inherits the list page's `auth`; its access is the list's.
        authz: 'skip',
        componentLoader: () => import('./pages/todos/new.js'),
        name: 'todo-new',
        path: 'new',
      },
    ],
  },
  {
    // The Scheduler's management page. The plugin registers the Schedules and owns their records, but ships no page;
    // the page id is the plugin's own grant, `page:scheduler.schedules/access`, which its API also enforces.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    },
    componentLoader: () => import('./pages/schedules/index.js'),
    name: 'schedules',
    path: '/schedules',
    navigation: { title: 'navigation.schedules', icon: CalendarClock },
    children: [
      {
        // One Schedule's execution records, a drawer over the list. It reads the same grant through the plugin's API.
        authz: 'skip',
        componentLoader: () => import('./pages/schedules/occurrences.js'),
        name: 'schedule-occurrences',
        path: ':scheduleId/occurrences',
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
