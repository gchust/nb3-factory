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
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/dashboard.js'),
    name: 'dashboard',
    path: '/dashboard',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/leads.js'),
    name: 'leads',
    path: '/leads',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/customers.js'),
    name: 'customers',
    path: '/customers',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/contacts.js'),
    name: 'contacts',
    path: '/contacts',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/opportunities.js'),
    name: 'opportunities',
    path: '/opportunities',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/follow-ups.js'),
    name: 'follow-ups',
    path: '/follow-ups',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/directory.js'),
    name: 'directory',
    path: '/directory',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
