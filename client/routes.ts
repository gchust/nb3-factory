import { Building2, Home, Target, Users } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/** The customer drawer and the edit dialog stacked on it. */
function customerDetailRoutes(): AppClientRouteDefinition[] {
  return [
    {
      // /customers/:customerId: the detail drawer (RouteDrawer).
      name: 'customer-detail',
      path: ':customerId',
      authz: 'skip',
      componentLoader: () => import('./pages/crm/customers/detail/index.js'),
      children: [
        {
          // /customers/:customerId/edit: the edit dialog, stacked on the drawer.
          name: 'customer-detail-edit',
          path: 'edit',
          authz: 'skip',
          componentLoader: () => import('./pages/crm/customers/edit.js'),
        },
      ],
    },
  ];
}

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
    // The sales team shares one set of permissions, so the business pages take part in no page authorization:
    // every signed-in user reaches them, exactly as the customer, contact and opportunity endpoints require only a
    // session. Each carries a menu entry, so the application navigation leads to the CRM.
    name: 'customers',
    path: '/customers',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.customers', icon: Building2 },
    componentLoader: () => import('./pages/crm/customers/index.js'),
    children: [
      {
        // /customers/new: the create dialog (RouteDialog).
        name: 'customer-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/new.js'),
      },
      {
        // /customers/edit/:customerId: the edit dialog opened from a row's menu, alone over the list.
        name: 'customer-edit',
        path: 'edit/:customerId',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/edit.js'),
      },
      // /customers/:customerId (customer-detail) and /customers/:customerId/edit (customer-detail-edit).
      ...customerDetailRoutes(),
    ],
  },
  {
    name: 'contacts',
    path: '/contacts',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.contacts', icon: Users },
    componentLoader: () => import('./pages/crm/contacts/index.js'),
    children: [
      {
        // /contacts/new: the create dialog.
        name: 'contact-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/new.js'),
      },
      {
        // /contacts/edit/:contactId: the edit dialog.
        name: 'contact-edit',
        path: 'edit/:contactId',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/edit.js'),
      },
    ],
  },
  {
    name: 'opportunities',
    path: '/opportunities',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.opportunities', icon: Target },
    componentLoader: () => import('./pages/crm/opportunities/index.js'),
    children: [
      {
        // /opportunities/new: the create dialog.
        name: 'opportunity-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/new.js'),
      },
      {
        // /opportunities/edit/:opportunityId: the edit dialog.
        name: 'opportunity-edit',
        path: 'edit/:opportunityId',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/edit.js'),
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
