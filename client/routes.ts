import { Home, UsersRound } from 'lucide-react';
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
    // CRM is a navigation group: it owns the sidebar section and its menu icon, and the pages inside it carry full
    // paths. Every signed-in user may view and edit all CRM records, so the group needs no access of its own.
    name: 'crm',
    navigation: { title: 'navigation.crm', icon: UsersRound },
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/customers/index.js'),
        name: 'customers',
        navigation: { title: 'navigation.customers' },
        path: '/customers',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/customers/new.js'),
            name: 'customer-new',
            path: 'new',
          },
          {
            // The customer detail drawer. It renders the child edit dialog through its own Outlet.
            authz: 'skip',
            componentLoader: () => import('./pages/customers/detail/index.js'),
            name: 'customer-detail',
            path: ':customerId',
            children: [
              {
                authz: 'skip',
                componentLoader: () =>
                  import('./pages/customers/detail/edit.js'),
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
        componentLoader: () => import('./pages/contacts/index.js'),
        name: 'contacts',
        navigation: { title: 'navigation.contacts' },
        path: '/contacts',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/contacts/new.js'),
            name: 'contact-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/contacts/edit.js'),
            name: 'contact-edit',
            path: ':contactId/edit',
          },
        ],
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/opportunities/index.js'),
        name: 'opportunities',
        navigation: { title: 'navigation.opportunities' },
        path: '/opportunities',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/opportunities/new.js'),
            name: 'opportunity-new',
            path: 'new',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/opportunities/edit.js'),
            name: 'opportunity-edit',
            path: ':opportunityId/edit',
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
