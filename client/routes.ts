import { Building2, Home, Target, UserRound } from 'lucide-react';
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
    name: 'crm-customers',
    navigation: { title: 'crm.customers.title', icon: Building2 },
    path: '/crm/customers',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/new.js'),
        name: 'crm-customer-new',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/detail/index.js'),
        name: 'crm-customer-detail',
        path: ':customerId',
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
    navigation: { title: 'crm.contacts.title', icon: UserRound },
    path: '/crm/contacts',
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
    navigation: { title: 'crm.opportunities.title', icon: Target },
    path: '/crm/opportunities',
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
