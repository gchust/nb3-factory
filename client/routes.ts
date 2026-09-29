import { Building2, Home, Target, UsersRound } from 'lucide-react';
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
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/crm/customers/index.js'),
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Building2 },
    path: '/customers',
    children: [
      {
        // /customers/new: the create dialog. The static segment outranks :customerId.
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/new.js'),
        name: 'customer-new',
        path: 'new',
      },
      {
        // /customers/:customerId: the detail drawer.
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/detail/index.js'),
        name: 'customer-detail',
        path: ':customerId',
        children: [
          {
            // /customers/:customerId/edit: the edit dialog, stacked on the detail drawer.
            authz: 'skip',
            componentLoader: () =>
              import('./pages/crm/customers/detail/edit.js'),
            name: 'customer-edit',
            path: 'edit',
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/crm/contacts/index.js'),
    name: 'contacts',
    navigation: { title: 'navigation.contacts', icon: UsersRound },
    path: '/contacts',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/new.js'),
        name: 'contact-new',
        path: 'new',
      },
      {
        // /contacts/:contactId/edit: the edit dialog.
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/edit.js'),
        name: 'contact-edit',
        path: ':contactId/edit',
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/crm/opportunities/index.js'),
    name: 'opportunities',
    navigation: { title: 'navigation.opportunities', icon: Target },
    path: '/opportunities',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/new.js'),
        name: 'opportunity-new',
        path: 'new',
      },
      {
        // /opportunities/:opportunityId/edit: the edit dialog.
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/edit.js'),
        name: 'opportunity-edit',
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
