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
    // The customer list. Its `new` dialog and `:customerId` detail drawer are children, so they render inside the
    // list page's `<Outlet />` and keep the list behind them mounted. `authz: 'skip'` matches the landing page: the
    // task asks for these records to be available to every signed-in user, and the server routes do the same.
    auth: 'required',
    authz: 'skip',
    name: 'customers',
    path: '/customers',
    componentLoader: () => import('./pages/customers/index.js'),
    navigation: { title: 'navigation.customers', icon: Users },
    children: [
      {
        name: 'customer-create',
        path: 'new',
        componentLoader: () => import('./pages/customers/new.js'),
      },
      {
        name: 'customer-detail',
        path: ':customerId',
        componentLoader: () => import('./pages/customers/detail.js'),
        children: [
          {
            name: 'customer-edit',
            path: 'edit',
            componentLoader: () => import('./pages/customers/edit.js'),
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    name: 'contacts',
    path: '/contacts',
    componentLoader: () => import('./pages/contacts/index.js'),
    navigation: { title: 'navigation.contacts', icon: Contact },
    children: [
      {
        name: 'contact-create',
        path: 'new',
        componentLoader: () => import('./pages/contacts/new.js'),
      },
      {
        name: 'contact-edit',
        path: ':contactId/edit',
        componentLoader: () => import('./pages/contacts/edit.js'),
      },
    ],
  },
  {
    auth: 'required',
    authz: 'skip',
    name: 'opportunities',
    path: '/opportunities',
    componentLoader: () => import('./pages/opportunities/index.js'),
    navigation: { title: 'navigation.opportunities', icon: TrendingUp },
    children: [
      {
        name: 'opportunity-create',
        path: 'new',
        componentLoader: () => import('./pages/opportunities/new.js'),
      },
      {
        name: 'opportunity-edit',
        path: ':opportunityId/edit',
        componentLoader: () => import('./pages/opportunities/edit.js'),
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
