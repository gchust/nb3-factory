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
    // CRM is an application feature, not a plugin: the pages, endpoints and tables all live in this application.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/crm/customers/index.js'),
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Users },
    path: '/customers',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/new.js'),
        name: 'customer-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/customers/detail/index.js'),
        name: 'customer-detail',
        path: ':customerId',
        children: [
          {
            auth: 'required',
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
    navigation: { title: 'navigation.contacts', icon: Contact },
    path: '/contacts',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/new.js'),
        name: 'contact-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/contacts/edit.js'),
        name: 'contact-edit',
        path: ':contactId',
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
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/new.js'),
        name: 'opportunity-new',
        path: 'new',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/crm/opportunities/edit.js'),
        name: 'opportunity-edit',
        path: ':opportunityId',
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
