import { Contact, Handshake, Home, TrendingUp, Users } from 'lucide-react';
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
    // A navigation group names no page and owns no path; the pages inside it use full paths.
    name: 'sales',
    navigation: { title: 'navigation.sales', icon: Handshake },
    children: [
      {
        auth: 'required',
        authz: 'skip',
        breadcrumb: { title: 'navigation.salesCustomers' },
        componentLoader: () => import('./pages/sales/customers/index.js'),
        name: 'sales-customers',
        navigation: { title: 'navigation.salesCustomers', icon: Users },
        path: '/sales/customers',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/sales/customers/new.js'),
            name: 'sales-customers-new',
            path: 'new',
          },
          {
            authz: 'skip',
            // A covering child page is a destination, so it names itself in the trail.
            breadcrumb: { title: 'sales.customer.detailBreadcrumb' },
            componentLoader: () =>
              import('./pages/sales/customers/detail/index.js'),
            name: 'sales-customer-detail',
            path: ':customerId',
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/customers/detail/edit.js'),
                name: 'sales-customer-edit',
                path: 'edit',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/customers/detail/contact-new.js'),
                name: 'sales-customer-contact-new',
                path: 'contacts/new',
              },
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/customers/detail/opportunity-new.js'),
                name: 'sales-customer-opportunity-new',
                path: 'opportunities/new',
              },
            ],
          },
        ],
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/contacts/index.js'),
        name: 'sales-contacts',
        navigation: { title: 'navigation.salesContacts', icon: Contact },
        path: '/sales/contacts',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/sales/contacts/new.js'),
            name: 'sales-contacts-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () =>
              import('./pages/sales/contacts/detail/index.js'),
            name: 'sales-contact-detail',
            path: ':contactId',
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/contacts/detail/edit.js'),
                name: 'sales-contact-edit',
                path: 'edit',
              },
            ],
          },
        ],
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/opportunities/index.js'),
        name: 'sales-opportunities',
        navigation: {
          title: 'navigation.salesOpportunities',
          icon: TrendingUp,
        },
        path: '/sales/opportunities',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/sales/opportunities/new.js'),
            name: 'sales-opportunities-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () =>
              import('./pages/sales/opportunities/detail/index.js'),
            name: 'sales-opportunity-detail',
            path: ':opportunityId',
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/sales/opportunities/detail/edit.js'),
                name: 'sales-opportunity-edit',
                path: 'edit',
              },
            ],
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
