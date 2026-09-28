import { Briefcase, Contact, Home, Target, Users } from 'lucide-react';
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
    // The CRM pages all opt out of page authorization: this application serves a single sales team, so every signed-in
    // user works with the same customers, contacts and opportunities.
    auth: 'required',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/customers/index.js'),
        name: 'customers',
        navigation: { title: 'navigation.customers', icon: Users },
        path: '/customers',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/contacts/index.js'),
        name: 'contacts',
        navigation: { title: 'navigation.contacts', icon: Contact },
        path: '/contacts',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/opportunities/index.js'),
        name: 'opportunities',
        navigation: { title: 'navigation.opportunities', icon: Target },
        path: '/opportunities',
      },
    ],
    name: 'crm',
    navigation: { title: 'navigation.crm', icon: Briefcase },
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
