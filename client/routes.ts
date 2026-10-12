import { FileText, Home, Settings, Users } from 'lucide-react';
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
    // The landing page and the inbox opted out of page authorization, so they are reachable by every signed-in user.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
  },
  {
    // Internal materials. The page grant is stored under this id; the permission sets `material-editor` and
    // `material-reader` reference it, and the API checks the same record scopes independently.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FileText },
    path: '/materials',
    children: [
      {
        // The create dialog. Nested pages inherit the list's page grant, so `authz` is omitted deliberately.
        componentLoader: () => import('./pages/materials/new.js'),
        name: 'materials-new',
        path: 'new',
      },
      {
        // A row menu's Edit, opened alone over the list.
        componentLoader: () => import('./pages/materials/detail/edit.js'),
        name: 'materials-edit',
        path: 'edit/:materialId',
      },
      {
        // The detail drawer.
        componentLoader: () => import('./pages/materials/detail/index.js'),
        name: 'materials-detail',
        path: ':materialId',
        children: [
          {
            // Edit stacked on the drawer.
            componentLoader: () => import('./pages/materials/detail/edit.js'),
            name: 'materials-detail-edit',
            path: 'edit',
          },
          {
            // Temporary sharing, stacked on the drawer.
            componentLoader: () => import('./pages/materials/detail/shares.js'),
            name: 'materials-detail-shares',
            path: 'shares',
          },
        ],
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
  {
    // A pure navigation group: no componentLoader, no authz. Administration pages live here rather than in a
    // separate settings area, which this application does not have.
    name: 'settings',
    path: '/settings',
    navigation: { title: 'navigation.settings', icon: Settings, order: 100 },
    children: [
      {
        // Staff and work permissions. Only root may open it; the Users API enforces its `user` actions independently.
        auth: 'required',
        authz: 'unrestricted',
        componentLoader: () => import('./pages/staff/index.js'),
        name: 'staff',
        navigation: { title: 'navigation.staff', icon: Users },
        path: '/staff',
        children: [
          {
            // The permission-set editor for one person.
            componentLoader: () => import('./pages/staff/roles.js'),
            name: 'staff-roles',
            path: ':userId',
          },
        ],
      },
    ],
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
