import { CalendarClockIcon, Home, ListTodoIcon } from 'lucide-react';
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
    // A minimal todo list whose only job is to make the overdue check watchable: its rows show exactly the four
    // fields the check reads and writes. No page authorization of its own, so every signed-in user can look.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/todos/index.js'),
    name: 'todos',
    navigation: { title: 'navigation.todos', icon: ListTodoIcon },
    path: '/todos',
    children: [
      {
        // The create form as a child route, so the URL addresses it and closing returns to the list.
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/todos/new.js'),
        name: 'todos-new',
        path: 'new',
      },
    ],
  },
  {
    // The Scheduler plugin owns the schedules, their history and this page's permission, but contributes no page of
    // its own — so the application draws the list its administrators read. Stored page grants reference
    // `scheduler.schedules`, which is why the resource id is the plugin's and not a new one.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    },
    componentLoader: () => import('./pages/scheduler/index.js'),
    name: 'scheduler',
    navigation: { title: 'navigation.scheduler', icon: CalendarClockIcon },
    path: '/scheduler',
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
