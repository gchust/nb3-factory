import { Briefcase, Home } from 'lucide-react';
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
    // The sales group is a menu section with no page of its own; a group cannot declare
    // `authz`, and it inherits `auth: 'required'` into every page below it.
    auth: 'required',
    name: 'sales',
    path: '/sales',
    navigation: { title: 'navigation.sales', icon: Briefcase },
    children: [
      {
        authz: 'skip',
        name: 'sales-customers',
        path: 'customers',
        navigation: { title: 'navigation.salesCustomers' },
        componentLoader: () => import('./pages/sales/customers/index.js'),
        children: [
          {
            name: 'sales-customer-new',
            path: 'new',
            componentLoader: () => import('./pages/sales/customers/new.js'),
          },
          {
            name: 'sales-customer-detail',
            path: ':customerId',
            componentLoader: () =>
              import('./pages/sales/customers/detail/index.js'),
            children: [
              {
                name: 'sales-customer-edit',
                path: 'edit',
                componentLoader: () =>
                  import('./pages/sales/customers/detail/edit.js'),
              },
            ],
          },
        ],
      },
      {
        authz: 'skip',
        name: 'sales-contacts',
        path: 'contacts',
        navigation: { title: 'navigation.salesContacts' },
        componentLoader: () => import('./pages/sales/contacts/index.js'),
        children: [
          {
            name: 'sales-contact-new',
            path: 'new',
            componentLoader: () => import('./pages/sales/contacts/new.js'),
          },
          {
            name: 'sales-contact-edit',
            path: ':contactId/edit',
            componentLoader: () => import('./pages/sales/contacts/edit.js'),
          },
        ],
      },
      {
        authz: 'skip',
        name: 'sales-opportunities',
        path: 'opportunities',
        navigation: { title: 'navigation.salesOpportunities' },
        componentLoader: () => import('./pages/sales/opportunities/index.js'),
        children: [
          {
            name: 'sales-opportunity-new',
            path: 'new',
            componentLoader: () => import('./pages/sales/opportunities/new.js'),
          },
          {
            name: 'sales-opportunity-edit',
            path: ':opportunityId/edit',
            componentLoader: () =>
              import('./pages/sales/opportunities/edit.js'),
          },
        ],
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
