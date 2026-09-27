import { CalendarClock, DoorOpen, Home } from 'lucide-react';
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
    // Every signed-in employee may book a room. The server scopes the list to
    // the owner's rows, so the page itself needs no permission check.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/meeting/bookings.js'),
    name: 'meeting-bookings',
    navigation: { title: 'meeting.navigation.bookings', icon: CalendarClock },
    path: '/meeting-bookings',
  },
  {
    // Maintaining rooms is an administrator's job. `unrestricted` hides the
    // page from everyone but root; the server enforces the same rule.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/meeting/rooms.js'),
    name: 'meeting-rooms',
    navigation: { title: 'meeting.navigation.rooms', icon: DoorOpen },
    path: '/meeting-rooms',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
