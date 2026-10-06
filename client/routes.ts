import { Building2, Contact, Home, Target, Users } from 'lucide-react';
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
    // A menu group owns no page of its own; it only organizes the three CRM lists below it.
    name: 'crm',
    navigation: { title: 'navigation.crm', icon: Users },
    children: [
      {
        // One sales team, so every signed-in user may work with every record: the server only checks the session.
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/index.js'),
        name: 'crm-customers',
        navigation: { title: 'navigation.customers', icon: Building2 },
        path: 'customers',
        breadcrumb: { title: 'navigation.customers' },
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/crm/customers/new.js'),
            name: 'crm-customer-new',
            path: 'new',
          },
          {
            // The detail child route covers its parent list and shows contacts, opportunities and the amount total.
            authz: 'skip',
            componentLoader: () =>
              import('./pages/crm/customers/detail/index.js'),
            name: 'crm-customer-detail',
            path: ':customerId',
            breadcrumb: { title: 'navigation.customerDetail' },
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/crm/customers/detail/edit.js'),
                name: 'crm-customer-edit',
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
        name: 'crm-contacts',
        navigation: { title: 'navigation.contacts', icon: Contact },
        path: 'contacts',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/crm/contacts/new.js'),
            name: 'crm-contact-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/crm/contacts/edit.js'),
            name: 'crm-contact-edit',
            path: ':contactId/edit',
          },
        ],
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/index.js'),
        name: 'crm-opportunities',
        navigation: { title: 'navigation.opportunities', icon: Target },
        path: 'opportunities',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/crm/opportunities/new.js'),
            name: 'crm-opportunity-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/crm/opportunities/edit.js'),
            name: 'crm-opportunity-edit',
            path: ':opportunityId/edit',
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
