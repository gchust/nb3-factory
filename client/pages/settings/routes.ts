import { BellRing, Settings, ShieldCheck, Users, Workflow } from 'lucide-react';
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
        name: 'settingsHelpdeskWorkflow',
        path: '/helpdesk-workflow',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'helpdesk.workflow' },
          action: 'read',
        },
        navigation: { title: 'helpdesk.workflow.title', icon: Workflow },
        breadcrumb: { title: 'helpdesk.workflow.title' },
        componentLoader: () => import('./helpdesk/workflow.js'),
        children: [
          {
            name: 'settingsHelpdeskDefinitions',
            path: 'definitions',
            breadcrumb: { title: 'helpdesk.workflow.tabs.definitions' },
            componentLoader: () => import('./helpdesk/definitions.js'),
            children: [
              {
                name: 'settingsHelpdeskDefinition',
                path: ':definitionName',
                breadcrumb: { title: 'helpdesk.workflow.ticketProcess' },
                componentLoader: () =>
                  import('./helpdesk/definition-detail.js'),
              },
            ],
          },
          {
            name: 'settingsHelpdeskExecutions',
            path: 'executions',
            breadcrumb: { title: 'helpdesk.workflow.tabs.executions' },
            componentLoader: () => import('./helpdesk/executions.js'),
            children: [
              {
                name: 'settingsHelpdeskExecution',
                path: ':transitionId',
                breadcrumb: { title: 'helpdesk.workflow.executionDetail' },
                componentLoader: () => import('./helpdesk/execution-detail.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'settingsHelpdeskReminders',
        path: '/helpdesk-reminders',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'helpdesk.reminders' },
          action: 'read',
        },
        navigation: { title: 'helpdesk.reminders.title', icon: BellRing },
        breadcrumb: { title: 'helpdesk.reminders.title' },
        componentLoader: () => import('./helpdesk/reminders.js'),
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
