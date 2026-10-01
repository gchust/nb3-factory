import { Building2, Home } from 'lucide-react';
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
    // A navigation group only groups pages; the pages inside it declare full paths and the group renders their Outlet.
    name: 'sales',
    navigation: { title: 'navigation.sales', icon: Building2 },
    children: [
      {
        name: 'customers',
        path: '/customers',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.customers' },
        componentLoader: () => import('./pages/sales/customers/index.js'),
        children: [
          {
            name: 'customer-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/sales/customers/new.js'),
          },
          {
            name: 'customer-detail',
            path: ':customerId',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/sales/customers/detail/index.js'),
            children: [
              {
                name: 'customer-detail-edit',
                path: 'edit',
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/customers/detail/edit.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'contacts',
        path: '/contacts',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.contacts' },
        componentLoader: () => import('./pages/sales/contacts/index.js'),
        children: [
          {
            name: 'contact-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/sales/contacts/new.js'),
          },
          {
            name: 'contact-edit',
            path: ':contactId/edit',
            authz: 'skip',
            componentLoader: () => import('./pages/sales/contacts/edit.js'),
          },
        ],
      },
      {
        name: 'opportunities',
        path: '/opportunities',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.opportunities' },
        componentLoader: () => import('./pages/sales/opportunities/index.js'),
        children: [
          {
            name: 'opportunity-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/sales/opportunities/new.js'),
          },
          {
            name: 'opportunity-edit',
            path: ':opportunityId/edit',
            authz: 'skip',
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
