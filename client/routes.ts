import {
  Briefcase,
  CalendarClock,
  Home,
  LayoutDashboard,
  Users,
} from 'lucide-react';
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
    // The CRM pages are granted by permission set, not by role: a rep and a supervisor both open them, and the
    // data they see inside is scoped by the CRM permission sets each one holds.
    name: 'crm',
    navigation: { title: 'navigation.crm', icon: Briefcase },
    children: [
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'crm.dashboard' },
          action: 'access',
        },
        componentLoader: () => import('./pages/crm/index.js'),
        name: 'crm-dashboard',
        navigation: {
          title: 'navigation.crm.dashboard',
          icon: LayoutDashboard,
        },
        path: '/crm',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'crm.customers' },
          action: 'access',
        },
        componentLoader: () => import('./pages/crm/customers/index.js'),
        name: 'crm-customers',
        navigation: { title: 'navigation.crm.customers', icon: Users },
        path: '/crm/customers',
        children: [
          {
            componentLoader: () => import('./pages/crm/customers/detail.js'),
            name: 'crm-customer-detail',
            path: ':customerId',
          },
          {
            componentLoader: () => import('./pages/crm/customers/import.js'),
            name: 'crm-customer-import',
            path: 'import',
          },
        ],
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'crm.opportunities' },
          action: 'access',
        },
        componentLoader: () => import('./pages/crm/opportunities/index.js'),
        name: 'crm-opportunities',
        navigation: {
          title: 'navigation.crm.opportunities',
          icon: Briefcase,
        },
        path: '/crm/opportunities',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'crm.follow-ups' },
          action: 'access',
        },
        componentLoader: () => import('./pages/crm/follow-ups/index.js'),
        name: 'crm-follow-ups',
        navigation: {
          title: 'navigation.crm.followUps',
          icon: CalendarClock,
        },
        path: '/crm/follow-ups',
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
