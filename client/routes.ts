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
    // The sales team is one responsibility: every signed-in member reads and changes every customer, contact and
    // opportunity, which the endpoints enforce by requiring a session alone. `authz: 'skip'` says the same on the
    // client: no page grant is consulted, so these pages stay reachable whenever someone is signed in.
    name: 'customers',
    path: '/customers',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.customers', icon: Building2, order: 10 },
    componentLoader: () => import('./pages/sales/customers/index.js'),
    children: [
      {
        // /customers/new: create dialog over the list
        name: 'customer-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/customers/new.js'),
      },
      {
        // /customers/edit/:customerId: edit dialog opened from a row, alone over the list
        name: 'customer-edit',
        path: 'edit/:customerId',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/customers/edit.js'),
      },
      {
        // /customers/:customerId: the customer's detail drawer, with its contacts, opportunities and total
        name: 'customer-detail',
        path: ':customerId',
        authz: 'skip',
        componentLoader: () =>
          import('./pages/sales/customers/detail/index.js'),
        children: [
          {
            // /customers/:customerId/edit: edit dialog stacked on the drawer
            name: 'customer-detail-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/sales/customers/detail/edit.js'),
          },
          {
            // /customers/:customerId/opportunities/:opportunityId/edit: edit dialog stacked on the drawer, so an
            // amount changed here refreshes the total the drawer shows
            name: 'customer-detail-opportunity-edit',
            path: 'opportunities/:opportunityId/edit',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/sales/opportunities/edit.js'),
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
    navigation: { title: 'navigation.contacts', icon: Users, order: 11 },
    componentLoader: () => import('./pages/sales/contacts/index.js'),
    children: [
      {
        // /contacts/new: create dialog over the list
        name: 'contact-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/contacts/new.js'),
      },
      {
        // /contacts/edit/:contactId: edit dialog opened from a row's action
        name: 'contact-edit',
        path: 'edit/:contactId',
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
    navigation: { title: 'navigation.opportunities', icon: Target, order: 12 },
    componentLoader: () => import('./pages/sales/opportunities/index.js'),
    children: [
      {
        // /opportunities/new: create dialog over the list
        name: 'opportunity-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/opportunities/new.js'),
      },
      {
        // /opportunities/edit/:opportunityId: edit dialog opened from a row's action
        name: 'opportunity-edit',
        path: 'edit/:opportunityId',
        authz: 'skip',
        componentLoader: () => import('./pages/sales/opportunities/edit.js'),
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
