import { Clock3, Settings, Users, ShieldCheck } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/** Register this contribution as business capabilities are developed; keep a bare Home-only application free of settings. */
const systemSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'settings',
    path: '/settings',
    navigation: { title: 'settings.title', icon: Settings, order: 100 },
    children: [
      {
        name: 'settingsUsers',
        path: '/users',
        auth: 'required',
        authz: { resource: { type: 'user', id: '*' }, action: 'read' },
        navigation: { title: 'settings.users', icon: Users },
        breadcrumb: { title: 'settings.users' },
        componentLoader: () => import('./users.js'),
        children: [
          {
            name: 'settingsUserCreate',
            path: 'create',
            authz: { resource: { type: 'user', id: '*' }, action: 'create' },
            componentLoader: () => import('./user-form.js'),
          },
          {
            name: 'settingsUser',
            path: ':userId',
            componentLoader: () => import('./user-detail.js'),
            children: [
              {
                name: 'settingsUserEdit',
                path: 'edit',
                componentLoader: () => import('./user-form.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'settingsSchedules',
        path: '/scheduled-tasks',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'scheduler.schedules' },
          action: 'access',
        },
        navigation: { title: 'todos.schedules.title', icon: Clock3 },
        breadcrumb: { title: 'todos.schedules.title' },
        componentLoader: () => import('./schedules.js'),
      },
      {
        // A sibling of the list, not a child: the list page renders its cards
        // above an outlet, so nesting would repeat the schedule overview on
        // the execution-history page.
        name: 'settingsSchedule',
        path: '/scheduled-tasks/detail/:scheduleId',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'scheduler.schedules' },
          action: 'access',
        },
        breadcrumb: { title: 'todos.schedules.detailTitle' },
        componentLoader: () => import('./schedule-detail.js'),
      },
      {
        name: 'settingsRoles',
        path: '/roles',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'authorization.permission-sets' },
          action: 'read',
        },
        navigation: { title: 'settings.roles', icon: ShieldCheck },
        breadcrumb: { title: 'settings.roles' },
        componentLoader: () => import('./roles.js'),
        children: [
          {
            name: 'settingsRoleCreate',
            path: 'create',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.permission-sets',
              },
              action: 'create',
            },
            breadcrumb: { title: 'settings.newRole' },
            componentLoader: () => import('./role-form.js'),
          },
          {
            name: 'settingsRoleEdit',
            path: ':key/edit',
            breadcrumb: { title: 'settings.editRole' },
            componentLoader: () => import('./role-form.js'),
          },
        ],
      },
    ],
  },
]);
export default systemSettingsRoutes;
