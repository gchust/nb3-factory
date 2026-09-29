import { Contact, Home } from 'lucide-react';
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
    // Every signed-in user reaches the address book. `authz: 'skip'` keeps it out of page authorization, because the
    // issue puts permission differentiation out of scope.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/contacts/index.js'),
    name: 'contacts',
    navigation: { title: 'navigation.contacts', icon: Contact },
    path: '/contacts',
    // Both dialogs are children of the list, so they mount over it and refresh it through <Outlet context>. They
    // inherit `auth: 'required'` and `authz: 'skip'` from this page, and register no page grant of their own.
    children: [
      {
        componentLoader: () => import('./pages/contacts/new.js'),
        name: 'contacts-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/contacts/edit.js'),
        name: 'contacts-edit',
        path: ':contactId/edit',
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
