import { CalendarClock, Home, ListChecks } from 'lucide-react';
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
    // A minimal, read-only todo list: it exists only so the "检查过期待办" Schedule has data to mark. Every signed-in
    // user may open it, and its endpoint only requires a session (see `server/routes/todos.ts`).
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/todos/index.js'),
    name: 'todos',
    navigation: { title: 'navigation.todos', icon: ListChecks },
    path: '/todos',
  },
  {
    // The Scheduler plugin contributes no pages, so this application reads its API for the plan list. The page grant
    // is the same resource the plugin's `/api/scheduler/...` routes check, so one grant opens both.
    authz: {
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    },
    auth: 'required',
    componentLoader: () => import('./pages/scheduler/index.js'),
    name: 'scheduler',
    navigation: { title: 'navigation.scheduler', icon: CalendarClock },
    path: '/scheduler',
    children: [
      {
        // A covering child page: the plan's name and its execution history. It inherits the parent's authz.
        name: 'scheduler-detail',
        path: ':scheduleId',
        breadcrumb: { title: 'scheduler.detail.breadcrumb' },
        componentLoader: () => import('./pages/scheduler/detail.js'),
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
