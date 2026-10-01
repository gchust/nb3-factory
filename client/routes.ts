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
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/customers/index.js'),
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Building2 },
    path: '/customers',
    children: [
      {
        authz: 'skip',
        name: 'customer-new',
        path: 'new',
        componentLoader: () => import('./pages/customers/new.js'),
      },
      {
        authz: 'skip',
        name: 'customer-detail',
        path: ':customerId',
        componentLoader: () => import('./pages/customers/detail/index.js'),
        children: [
          {
            authz: 'skip',
            name: 'customer-edit',
            path: 'edit',
            componentLoader: () => import('./pages/customers/detail/edit.js'),
          },
        ],
      },
    ],
  },
  {
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/contacts/index.js'),
    name: 'contacts',
    navigation: { title: 'navigation.contacts', icon: Users },
    path: '/contacts',
    children: [
      {
        authz: 'skip',
        name: 'contact-new',
        path: 'new',
        componentLoader: () => import('./pages/contacts/new.js'),
      },
      {
        authz: 'skip',
        name: 'contact-detail',
        path: ':contactId',
        componentLoader: () => import('./pages/contacts/detail/index.js'),
        children: [
          {
            authz: 'skip',
            name: 'contact-edit',
            path: 'edit',
            componentLoader: () => import('./pages/contacts/detail/edit.js'),
          },
        ],
      },
    ],
  },
  {
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/opportunities/index.js'),
    name: 'opportunities',
    navigation: { title: 'navigation.opportunities', icon: Target },
    path: '/opportunities',
    children: [
      {
        authz: 'skip',
        name: 'opportunity-new',
        path: 'new',
        componentLoader: () => import('./pages/opportunities/new.js'),
      },
      {
        authz: 'skip',
        name: 'opportunity-detail',
        path: ':opportunityId',
        componentLoader: () => import('./pages/opportunities/detail/index.js'),
        children: [
          {
            authz: 'skip',
            name: 'opportunity-edit',
            path: 'edit',
            componentLoader: () =>
              import('./pages/opportunities/detail/edit.js'),
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
