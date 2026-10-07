import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Home,
  IdCard,
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
    // Navigation group only: no path, component or authz of its own; each page
    // below carries its own path, page authorization and menu entry.
    name: 'hr',
    navigation: { title: 'navigation.hr', icon: Users },
    children: [
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'hr.departments' },
          action: 'access',
        },
        componentLoader: () => import('./pages/hr/departments.js'),
        name: 'hr-departments',
        navigation: { title: 'navigation.hrDepartments', icon: Building2 },
        path: '/hr/departments',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'hr.employees' },
          action: 'access',
        },
        componentLoader: () => import('./pages/hr/employees.js'),
        name: 'hr-employees',
        navigation: { title: 'navigation.hrEmployees', icon: Users },
        path: '/hr/employees',
      },
      {
        auth: 'required',
        authz: { resource: { type: 'page', id: 'hr.leave' }, action: 'access' },
        componentLoader: () => import('./pages/hr/leave.js'),
        name: 'hr-leave',
        navigation: { title: 'navigation.hrLeave', icon: CalendarDays },
        path: '/hr/leave',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'hr.approvals' },
          action: 'access',
        },
        componentLoader: () => import('./pages/hr/approvals.js'),
        name: 'hr-approvals',
        navigation: { title: 'navigation.hrApprovals', icon: ClipboardCheck },
        path: '/hr/approvals',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'hr.profile' },
          action: 'access',
        },
        componentLoader: () => import('./pages/hr/profile.js'),
        name: 'hr-profile',
        navigation: { title: 'navigation.hrProfile', icon: IdCard },
        path: '/hr/profile',
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
