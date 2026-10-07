import { BookOpen, Building2, DatabaseBackup, Home } from 'lucide-react';
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
    // The employee document center is open to every signed-in user by design: what a user may read is decided by the
    // server, per document, from their department membership. Page authorization would only add a second, coarser
    // gate in front of it. The preview is a child route so it stacks over the list and the browser back button closes
    // it.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/documents/index.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: BookOpen },
    path: '/documents',
    children: [
      {
        name: 'document-preview',
        path: ':documentId',
        componentLoader: () => import('./pages/documents/document-preview.js'),
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

// The administration console. `manage` is the single action of the `documentCenter` settings item, granted through
// the standard authorization pages; every page here inherits it from the group's first page, and each declares it
// explicitly so a grant stored for one page keeps working if the tree changes.
const documentCenterAuthz = {
  resource: { type: 'settings' as const, id: 'documentCenter' },
  action: 'manage',
};

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'document-center',
    path: '/document-center',
    navigation: {
      title: 'navigation.documentCenter',
      icon: DatabaseBackup,
      order: 140,
    },
    children: [
      {
        name: 'document-center-documents',
        path: '/documents',
        navigation: { title: 'navigation.documentCenterDocuments' },
        authz: documentCenterAuthz,
        componentLoader: () =>
          import('./pages/settings/document-center/index.js'),
        children: [
          {
            name: 'document-center-document-create',
            path: 'new',
            componentLoader: () =>
              import('./pages/settings/document-center/document-create.js'),
          },
          {
            name: 'document-center-document-edit',
            path: ':documentId/edit',
            componentLoader: () =>
              import('./pages/settings/document-center/document-edit.js'),
          },
          {
            name: 'document-center-document-versions',
            path: ':documentId/versions',
            componentLoader: () =>
              import('./pages/settings/document-center/document-versions.js'),
          },
        ],
      },
      {
        name: 'document-center-departments',
        path: '/departments',
        navigation: {
          title: 'navigation.documentCenterDepartments',
          icon: Building2,
        },
        authz: documentCenterAuthz,
        componentLoader: () =>
          import('./pages/settings/document-center/departments.js'),
        children: [
          {
            name: 'document-center-department-create',
            path: 'new',
            componentLoader: () =>
              import('./pages/settings/document-center/department-create.js'),
          },
          {
            name: 'document-center-department-edit',
            path: ':departmentId/edit',
            componentLoader: () =>
              import('./pages/settings/document-center/department-edit.js'),
          },
          {
            name: 'document-center-department-members',
            path: ':departmentId/members',
            componentLoader: () =>
              import('./pages/settings/document-center/department-members.js'),
          },
        ],
      },
      {
        name: 'document-center-backups',
        path: '/backups',
        navigation: { title: 'navigation.documentCenterBackups' },
        authz: documentCenterAuthz,
        componentLoader: () =>
          import('./pages/settings/document-center/backups.js'),
        children: [
          {
            name: 'document-center-backup-restore',
            path: ':backupId/restore',
            componentLoader: () =>
              import('./pages/settings/document-center/backup-restore.js'),
          },
        ],
      },
    ],
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
