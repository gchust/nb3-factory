import { Building2, Home, Target, Users } from 'lucide-react';
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
    // A single sales group works on all three record types, so every signed-in user reaches these pages. The server
    // routes still require an authenticated session; `auth: 'required'` only governs browser navigation.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/customers/index.js'),
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Building2, order: 10 },
    path: '/customers',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/customers/new.js'),
        name: 'customers-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/customers/detail/index.js'),
        name: 'customers-detail',
        path: ':customerId',
        children: [
          {
            auth: 'required',
            authz: 'skip',
            componentLoader: () => import('./pages/customers/detail/edit.js'),
            name: 'customers-detail-edit',
            path: 'edit',
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/contacts/index.js'),
    name: 'contacts',
    navigation: { title: 'navigation.contacts', icon: Users, order: 20 },
    path: '/contacts',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/contacts/new.js'),
        name: 'contacts-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/contacts/edit.js'),
        name: 'contacts-edit',
        path: ':contactId/edit',
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/opportunities/index.js'),
    name: 'opportunities',
    navigation: { title: 'navigation.opportunities', icon: Target, order: 30 },
    path: '/opportunities',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/opportunities/new.js'),
        name: 'opportunities-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/opportunities/edit.js'),
        name: 'opportunities-edit',
        path: ':opportunityId/edit',
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
