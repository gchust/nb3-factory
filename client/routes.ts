import { Contact, Home, Target, Users } from 'lucide-react';
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
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // The CRM pages are the application's whole business surface. There is one ordinary usage mode, so page
    // authorization is skipped rather than tied to a role system the application does not have; sign-in is the
    // boundary, and each endpoint enforces its own authentication.
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.customers' },
    componentLoader: () => import('./pages/crm/customers/index.js'),
    children: [
      {
        name: 'crmCustomerNew',
        path: 'new',
        componentLoader: () => import('./pages/crm/customers/new.js'),
      },
      {
        name: 'crmCustomerDetail',
        path: ':customerId',
        breadcrumb: { title: 'crm.customers.detailTitle' },
        componentLoader: () => import('./pages/crm/customers/detail.js'),
      },
      {
        name: 'crmCustomerEdit',
        path: ':customerId/edit',
        componentLoader: () => import('./pages/crm/customers/edit.js'),
      },
    ],
    name: 'crmCustomers',
    navigation: { title: 'navigation.customers', icon: Users },
    path: '/crm/customers',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.contacts' },
    componentLoader: () => import('./pages/crm/contacts/index.js'),
    children: [
      {
        name: 'crmContactNew',
        path: 'new',
        componentLoader: () => import('./pages/crm/contacts/new.js'),
      },
      {
        name: 'crmContactEdit',
        path: ':contactId/edit',
        componentLoader: () => import('./pages/crm/contacts/edit.js'),
      },
    ],
    name: 'crmContacts',
    navigation: { title: 'navigation.contacts', icon: Contact },
    path: '/crm/contacts',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.opportunities' },
    componentLoader: () => import('./pages/crm/opportunities/index.js'),
    children: [
      {
        name: 'crmOpportunityNew',
        path: 'new',
        componentLoader: () => import('./pages/crm/opportunities/new.js'),
      },
      {
        name: 'crmOpportunityEdit',
        path: ':opportunityId/edit',
        componentLoader: () => import('./pages/crm/opportunities/edit.js'),
      },
    ],
    name: 'crmOpportunities',
    navigation: { title: 'navigation.opportunities', icon: Target },
    path: '/crm/opportunities',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
