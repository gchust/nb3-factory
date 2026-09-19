import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Home,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/venues.js'),
    name: 'venues',
    navigation: { title: 'navigation.venues', icon: Building2 },
    path: '/venues',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/tenants.js'),
    name: 'tenants',
    navigation: { title: 'navigation.tenants', icon: Users },
    path: '/tenants',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/calendar.js'),
    name: 'calendar',
    navigation: { title: 'navigation.calendar', icon: CalendarDays },
    path: '/calendar',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/rentals/index.js'),
    name: 'rentals',
    navigation: { title: 'navigation.rentals', icon: ClipboardList },
    path: '/rentals',
  },
  {
    // A parameterized page is reachable from the list and has no menu entry.
    auth: 'required',
    componentLoader: () => import('./pages/rentals/detail.js'),
    name: 'rental-detail',
    path: '/rentals/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/summary.js'),
    name: 'summary',
    navigation: { title: 'navigation.summary', icon: BarChart3 },
    path: '/summary',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
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
