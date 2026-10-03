import { Briefcase, Building2, Home, Target, Users } from 'lucide-react';
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
    // The sales menu group: only a name, a menu label and the pages under it.
    name: 'sales',
    navigation: { title: 'navigation.sales', icon: Briefcase },
    children: [
      {
        // The sales team is one team with no role split, so these pages take every signed-in user and decide
        // accessibility with `authz: 'skip'`, the same choice the landing page makes.
        name: 'customers',
        path: '/customers',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.customers', icon: Building2 },
        componentLoader: () => import('./pages/crm/index.js'),
        children: [
          {
            name: 'customer-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/crm/new.js'),
          },
          {
            name: 'customer-detail',
            path: ':customerId',
            authz: 'skip',
            componentLoader: () => import('./pages/crm/detail/index.js'),
            children: [
              {
                name: 'customer-edit',
                path: 'edit',
                authz: 'skip',
                componentLoader: () => import('./pages/crm/detail/edit.js'),
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
        navigation: { title: 'navigation.contacts', icon: Users },
        componentLoader: () => import('./pages/crm/contacts/index.js'),
        children: [
          {
            name: 'contact-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/crm/contacts/new.js'),
          },
          {
            name: 'contact-edit',
            path: ':contactId/edit',
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
            name: 'opportunity-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/crm/opportunities/new.js'),
          },
          {
            name: 'opportunity-edit',
            path: ':opportunityId/edit',
            authz: 'skip',
            componentLoader: () => import('./pages/crm/opportunities/edit.js'),
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
