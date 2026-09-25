import { Contact, Home, TrendingUp, Users } from 'lucide-react';
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
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Users },
    path: '/customers',
    children: [
      {
        componentLoader: () => import('./pages/crm/customers/new.js'),
        name: 'customers-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/crm/customers/detail/index.js'),
        name: 'customers-detail',
        path: ':customerId',
      },
      {
        componentLoader: () => import('./pages/crm/customers/detail/edit.js'),
        name: 'customers-edit',
        path: ':customerId/edit',
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
        componentLoader: () => import('./pages/crm/contacts/new.js'),
        name: 'contacts-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/crm/contacts/edit.js'),
        name: 'contacts-edit',
        path: ':contactId',
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/crm/opportunities/index.js'),
    name: 'opportunities',
    navigation: { title: 'navigation.opportunities', icon: TrendingUp },
    path: '/opportunities',
    children: [
      {
        componentLoader: () => import('./pages/crm/opportunities/new.js'),
        name: 'opportunities-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/crm/opportunities/edit.js'),
        name: 'opportunities-edit',
        path: ':opportunityId',
      },
    ],
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
