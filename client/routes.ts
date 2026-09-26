import { Archive, ClipboardList, Home } from 'lucide-react';
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
    // The equipment ledger: the list, and the create, edit and borrow dialogs that open over it.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/equipment/index.js'),
    name: 'equipment',
    navigation: { title: 'navigation.equipment', icon: Archive },
    path: '/equipment',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/equipment/new.js'),
        name: 'equipment-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/equipment/edit.js'),
        name: 'equipment-edit',
        path: ':equipmentId/edit',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/equipment/borrow.js'),
        name: 'equipment-borrow',
        path: ':equipmentId/borrow',
      },
    ],
  },
  {
    // Every loan, with the return confirmation and the standalone borrow dialog.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/borrow-records/index.js'),
    name: 'borrow-records',
    navigation: { title: 'navigation.borrowRecords', icon: ClipboardList },
    path: '/borrow-records',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/borrow-records/new.js'),
        name: 'borrow-record-new',
        path: 'new',
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
